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
      // Return role only — token is provided as httpOnly cookie
      return res.json({ success: true, data: { role: user.role } });
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

// Logout clears the cookie
router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true });
});

module.exports = router;
