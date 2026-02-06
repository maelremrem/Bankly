const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

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

      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '8h' });
      // Set httpOnly cookie so static dashboard requests can be authenticated
      res.cookie('token', token, { httpOnly: true, maxAge: 8 * 3600 * 1000, sameSite: 'lax' });
      // Return token for API clients/tests using Authorization header
      return res.json({ success: true, data: { role: user.role, token } });
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

// Login with username and PIN (for touch interface)
router.post('/pin-login', async (req, res) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) return res.status(400).json({ success: false, error: 'Missing username or pin' });

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
      if (!user) return res.status(401).json({ success: false, error: 'User not found' });

      if (!user.pin_hash) return res.status(401).json({ success: false, error: 'PIN not set for this user' });

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

module.exports = router;
