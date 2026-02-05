require('dotenv').config();
const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth');
const app = express();

app.use(express.json());

// Serve static files from frontend
const frontendPath = path.join(__dirname, '../../frontend/public');
console.log('Serving frontend from:', frontendPath);
app.use(express.static(frontendPath));

// Expose the standalone admin and user dashboards (protected)
const adminFrontendPath = path.join(__dirname, '../../frontend/admin');
const userFrontendPath = path.join(__dirname, '../../frontend/user');
const { requireAuth, requireAdmin, requireAuthWeb, requireAdminWeb } = require('./middleware/auth');

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
    windowMs: 60 * 1000, // 1 minute
    max: 60,
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
