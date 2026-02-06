const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');
const logger = require('../config/logger');

function getCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  const parts = header.split(';').map(p => p.trim());
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Missing credentials' });

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
      if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ success: false, error: 'Invalid credentials' });

      const accessToken = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '8h' });
      // Create refresh token
      const crypto = require('crypto');
      const refreshToken = crypto.randomBytes(64).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(); // 30 days

      try {
        const insertResult = await db.runAsync('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [user.id, tokenHash, expiresAt]);
        logger.info(`refresh_token created id=${insertResult.lastID} user=${user.id}`);
      } catch (err2) {
        logger.error('Failed to store refresh token', err2);
      }

      // Set cookies
      res.cookie('token', accessToken, { httpOnly: true, maxAge: 8 * 3600 * 1000, sameSite: 'lax' });
      res.cookie('refresh', refreshToken, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });

      // Return token for API clients/tests using Authorization header
      return res.json({ success: true, data: { role: user.role, token: accessToken } });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  db.get('SELECT id, username, role, balance, language FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  });
});

router.post('/rfid-login', async (req, res) => {
  try {
    const { card_uid, pin } = req.body;
    if (!card_uid || !pin) return res.status(400).json({ success: false, error: 'Missing card_uid or pin' });

    db.get('SELECT * FROM users WHERE rfid_card_id = ?', [card_uid], async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
      if (!user) return res.status(401).json({ success: false, error: 'Card not recognized' });

      const pinMatch = await bcrypt.compare(pin, user.pin_hash);
      if (!pinMatch) return res.status(401).json({ success: false, error: 'Invalid PIN' });

      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '8h' });
      res.cookie('token', token, { httpOnly: true, maxAge: 8 * 3600 * 1000, sameSite: 'lax' });
      return res.json({ success: true, data: { role: user.role, token } });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/rfid-redirect', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing token');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    const role = decoded.role;

    // Set the token cookie
    res.cookie('token', token, { httpOnly: true, maxAge: 8 * 3600 * 1000, sameSite: 'lax' });

    // Redirect to appropriate dashboard
    if (role === 'admin') {
      res.redirect('/admin/dashboard.html');
    } else {
      res.redirect('/user/dashboard.html');
    }
  } catch (error) {
    return res.status(401).send('Invalid token');
  }
});

// Get list of users for login selection (public, no auth required)
router.get('/users-public', (req, res) => {
  db.all('SELECT id, username FROM users WHERE role = ?', ['user'], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    res.json({ success: true, data: rows });
  });
});

// Refresh access token using refresh token cookie
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = getCookie(req, 'refresh') || req.body.refreshToken;
    if (!refreshToken) return res.status(401).json({ success: false, error: 'Missing refresh token' });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const row = await db.getAsync('SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP', [tokenHash]);
    if (!row) return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });

    // Issue new tokens (rotate refresh token)
    const userRow = await db.getAsync('SELECT id, role FROM users WHERE id = ?', [row.user_id]);
    if (!userRow) return res.status(401).json({ success: false, error: 'User not found' });

    const newAccessToken = jwt.sign({ userId: userRow.id, role: userRow.role }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '8h' });
    const newRefresh = crypto.randomBytes(64).toString('hex');
    const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    // Store new refresh and delete old one
    try {
      const insertResult = await db.runAsync('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [userRow.id, newHash, expiresAt]);
      await db.runAsync('DELETE FROM refresh_tokens WHERE id = ?', [row.id]);
      logger.info(`refresh_token rotated user=${userRow.id} old=${row.id} new=${insertResult.lastID}`);
    } catch (e) {
      logger.error('Failed to rotate refresh token', e);
    }

    // Set cookies
    res.cookie('token', newAccessToken, { httpOnly: true, maxAge: 8 * 3600 * 1000, sameSite: 'lax' });
    res.cookie('refresh', newRefresh, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });

    return res.json({ success: true, data: { token: newAccessToken } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Logout and revoke refresh token
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = getCookie(req, 'refresh') || req.body.refreshToken;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      try {
        const del = await db.runAsync('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
        logger.info(`refresh_token revoked token_hash=${tokenHash} deleted=${del.changes}`);
      } catch (e) {
        logger.error('Failed to revoke refresh token', e);
      }
    }
    // Clear cookies
    res.cookie('token', '', { maxAge: 0 });
    res.cookie('refresh', '', { maxAge: 0 });

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Login with username and PIN (for touch interface)
router.post('/pin-login', async (req, res) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) return res.status(400).json({ success: false, error: 'Missing username or pin' });

    // PIN format: 4-8 digits
    const pinFormat = /^\d{4,8}$/;
    if (!pinFormat.test(String(pin))) return res.status(400).json({ success: false, error: 'PIN must be 4-8 digits' });

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
      if (!user) return res.status(401).json({ success: false, error: 'User not found' });

      // If user has no pin yet, treat this PIN as first-time setup (create and continue)
      let pinCreated = false;
      if (!user.pin_hash) {
        try {
          const hash = await bcrypt.hash(String(pin), 10);
          await db.runAsync('UPDATE users SET pin_hash = ? WHERE id = ?', [hash, user.id]);
          logger.info(`pin created for user=${user.id}`);
          // mark flag so response can indicate PIN was created now
          pinCreated = true;
          // reload user row value for comparison
          user.pin_hash = hash;
        } catch (e) {
          console.error('Failed to set PIN', e);
          return res.status(500).json({ success: false, error: 'Failed to set PIN' });
        }
      }

      const pinMatch = await bcrypt.compare(pin, user.pin_hash);
      if (!pinMatch) return res.status(401).json({ success: false, error: 'Invalid PIN' });

      const accessToken = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '8h' });

      // Record audit when PIN was created as part of pin-login
      if (pinCreated) {
        try {
          await db.runAsync('INSERT INTO pin_audit (user_id, action, performed_by, details) VALUES (?, ?, ?, ?)', [user.id, 'created', null, 'created via pin-login']);
          logger.info(`pin_audit created for user=${user.id}`);
        } catch (auditErr) {
          logger.error('Failed to insert pin_audit record', auditErr);
        }
      }

      // create refresh token (same behavior as password login)
      const refreshToken = crypto.randomBytes(64).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      try {
        const insertResult = await db.runAsync('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [user.id, tokenHash, expiresAt]);
        logger.info(`refresh_token created id=${insertResult.lastID} user=${user.id}`);
      } catch (err2) {
        logger.error('Failed to store refresh token on pin-login', err2);
      }

      res.cookie('token', accessToken, { httpOnly: true, maxAge: 8 * 3600 * 1000, sameSite: 'lax' });
      res.cookie('refresh', refreshToken, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });

      logger.info(`pin-login result for user=${user.id} pinCreated=${pinCreated}`);
      return res.json({ success: true, data: { role: user.role, token: accessToken, pinCreated } });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Change PIN for authenticated user
router.post('/change-pin', requireAuth, async (req, res) => {
  try {
    const { oldPin, newPin } = req.body;
    if (!newPin || !/^\d{4,8}$/.test(String(newPin))) return res.status(400).json({ success: false, error: 'New PIN must be 4-8 digits' });

    const userRow = await db.getAsync('SELECT id, pin_hash FROM users WHERE id = ?', [req.user.userId]);
    if (!userRow) return res.status(404).json({ success: false, error: 'User not found' });

    // If user has an existing PIN, require oldPin
    if (userRow.pin_hash) {
      if (!oldPin) return res.status(400).json({ success: false, error: 'Old PIN is required' });
      const ok = await bcrypt.compare(String(oldPin), userRow.pin_hash);
      if (!ok) return res.status(401).json({ success: false, error: 'Invalid old PIN' });
    }

    const newHash = await bcrypt.hash(String(newPin), 10);
    await db.runAsync('UPDATE users SET pin_hash = ? WHERE id = ?', [newHash, req.user.userId]);
    try {
      const actionType = userRow.pin_hash ? 'changed' : 'created';
      await db.runAsync('INSERT INTO pin_audit (user_id, action, performed_by, details) VALUES (?, ?, ?, ?)', [req.user.userId, actionType, req.user.userId, actionType === 'created' ? 'created via change-pin' : 'changed via change-pin']);
      logger.info(`pin_audit ${actionType} for user=${req.user.userId}`);
    } catch (auditErr) {
      logger.error('Failed to insert pin_audit record', auditErr);
    }

    logger.info(`pin changed for user=${req.user.userId}`);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Verify PIN for authenticated user (used by keypad flows)
router.post('/verify-pin', requireAuth, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(String(pin))) return res.status(400).json({ success: false, error: 'PIN must be 4-8 digits' });
    const userRow = await db.getAsync('SELECT id, pin_hash FROM users WHERE id = ?', [req.user.userId]);
    if (!userRow) return res.status(404).json({ success: false, error: 'User not found' });
    if (!userRow.pin_hash) return res.status(400).json({ success: false, error: 'No PIN set' });
    const ok = await bcrypt.compare(String(pin), userRow.pin_hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid PIN' });
    return res.json({ success: true });
  } catch (err) {
    console.error('verify-pin error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
