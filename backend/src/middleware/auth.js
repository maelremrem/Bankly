const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  // Try Authorization header first
  const auth = req.headers.authorization;
  let token = null;
  if (auth && auth.startsWith('Bearer ')) {
    token = auth.slice(7);
  }

  // If not present, try cookie named 'token'
  if (!token && req.headers && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim());
    for (const c of cookies) {
      const [k, v] = c.split('=');
      if (k === 'token') {
        token = v;
        break;
      }
    }
  }

  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
  next();
}

// Require permission to reverse transactions: either admin role or user.can_reverse = 1
async function requireCanReverse(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (req.user.role === 'admin') return next();
  // check user's can_reverse flag from DB
  const db = require('../config/database');
  db.get('SELECT can_reverse FROM users WHERE id = ?', [req.user.userId], (err, row) => {
    if (err) {
      console.error('Failed to check permissions', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    if (row && row.can_reverse === 1) return next();
    return res.status(403).json({ success: false, error: 'Forbidden' });
  });
}

// Web-specific middlewares: redirect to root for unauthenticated/non-admin when requesting static pages
function requireAuthWeb(req, res, next) {
  // try header then cookie
  const auth = req.headers.authorization;
  let token = null;
  if (auth && auth.startsWith('Bearer ')) token = auth.slice(7);
  if (!token && req.headers && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim());
    for (const c of cookies) {
      const [k, v] = c.split('=');
      if (k === 'token') {
        token = v;
        break;
      }
    }
  }

  if (!token) return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    req.user = payload;
    next();
  } catch (err) {
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
}

function requireAdminWeb(req, res, next) {
  if (!req.user) return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
  if (req.user.role !== 'admin') return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
  next();
}

module.exports = { requireAuth, requireAdmin, requireCanReverse, requireAuthWeb, requireAdminWeb };
