const express = require('express');
const db = require('../config/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Overview stats
router.get('/overview', requireAuth, requireAdmin, async (req, res) => {
  try {
    db.get('SELECT COUNT(*) as totalUsers, COALESCE(SUM(balance),0) as totalBalance FROM users', [], (err, userRow) => {
      if (err) {
        console.error('Error fetching users summary', err);
        return res.status(500).json({ success: false, error: 'Server error' });
      }

      db.get('SELECT COUNT(*) as totalTransactions FROM transactions', [], (err2, txRow) => {
        if (err2) {
          console.error('Error fetching transactions summary', err2);
          return res.status(500).json({ success: false, error: 'Server error' });
        }

        return res.json({
          success: true,
          data: {
            totalUsers: userRow.totalUsers || 0,
            totalBalance: userRow.totalBalance || 0,
            totalTransactions: txRow.totalTransactions || 0
          }
        });
      });
    });
  } catch (error) {
    console.error('Overview error', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get all users (admin only) - flat array for dashboard
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  db.all('SELECT id, username, role, balance, created_at FROM users ORDER BY id ASC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching users for admin', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    res.json({ success: true, data: rows });
  });
});

// Get recent transactions (admin only) - flat array
router.get('/transactions', requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 20));
  db.all(
    `SELECT t.id, t.user_id, t.type, t.amount, t.description, t.created_at, u.username
     FROM transactions t
     JOIN users u ON t.user_id = u.id
     ORDER BY t.created_at DESC
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        console.error('Error fetching transactions for admin', err);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
      res.json({ success: true, data: rows });
    }
  );
});

module.exports = router;
