const path = require('path');
// Load .env from repository root (project runs with cwd=backend/, .env is at repo root)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const express = require('express');
const authRoutes = require('./routes/auth');
const app = express();

app.use(express.json());

// Serve static files from frontend
const frontendPath = path.join(__dirname, '../../frontend/public');
console.log('Serving frontend from:', frontendPath);

// Root should show the user login page
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Make the public frontend available
app.use(express.static(frontendPath));

// Redirect /login to /login.html
app.get('/login', (req, res) => {
    res.redirect('/login.html');
});

// Expose the standalone admin and user dashboards (protected)
const adminFrontendPath = path.join(__dirname, '../../frontend/admin');
const userFrontendPath = path.join(__dirname, '../../frontend/user');
const { requireAuth, requireAdmin, requireAuthWeb, requireAdminWeb } = require('./middleware/auth');

// Serve an admin-specific login endpoint so requests to /admin redirect there when unauthenticated
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});

// Protect admin static assets with web-friendly middleware that redirects non-admins
app.use('/admin', requireAuthWeb, requireAdminWeb, express.static(adminFrontendPath));
// Protect user dashboard (must be authenticated with redirect on failure)
app.use('/user', requireAuthWeb, express.static(userFrontendPath));

// Security & logging
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');
const logger = require('./config/logger');

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  app.use(Sentry.Handlers.requestHandler());
}

// app.use(helmet({
//   contentSecurityPolicy: false, // Disable CSP for development
// }));
app.use(
  rateLimit({
    // Make rate limiter configurable via env vars so it's less aggressive by default.
    // Defaults: 15 minutes window, 600 requests in window (adjust with env vars).
    windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 600,
  })
);

app.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));
app.use('/auth', authRoutes);
const usersRoutes = require('./routes/users');
app.use('/api/users', usersRoutes);
const transactionsRoutes = require('./routes/transactions');
app.use('/api/transactions', transactionsRoutes);
const tasksRoutes = require('./routes/tasks');
app.use('/api/tasks', tasksRoutes);
const allowancesRoutes = require('./routes/allowances');
app.use('/api/allowances', allowancesRoutes);
const advancesRoutes = require('./routes/advances');
app.use('/api/advances', advancesRoutes);
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

app.get('/api/config', (req, res) => {
  res.json({ success: true, defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en' });
});

// Expose a small client-side config JS so frontend can reliably read server envs
app.get('/js/client-config.js', (req, res) => {
  res.type('application/javascript');
  const cfg = {
    defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
    // DEFAULT_CURRENCY can be a symbol ("$", "€") or a word ("token", "argent")
    currency: process.env.DEFAULT_CURRENCY || '$',
    // DEFAULT_CURRENCY_PATTERN allows placing currency before/after value.
    // Use '%c' for currency and '%v' for numeric value. Examples:
    //  DEFAULT_CURRENCY_PATTERN="%c%v"  -> $12.34
    //  DEFAULT_CURRENCY_PATTERN="%v %c" -> 12.34 token
    // If unset, frontend fallbacks to heuristic (short currency -> prefix, word -> suffix).
    currencyPattern: process.env.DEFAULT_CURRENCY_PATTERN || undefined
  };
  res.send(`window.BANKLY_CONFIG = ${JSON.stringify(cfg)};`);
});

// Start allowance scheduler (skip when running tests)
const schedulerService = require('./services/schedulerService');
if (process.env.NODE_ENV !== 'test') {
  schedulerService.start();
}

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Bankly backend listening on port ${PORT}`);
  });
}

module.exports = app; // for tests
