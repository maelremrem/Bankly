const express = require('express');
const db = require('../config/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

// Overview stats (HTML fragment for HTMX)
router.get('/overview/html', requireAuth, requireAdmin, async (req, res) => {
  try {
    db.get('SELECT COUNT(*) as totalUsers, COALESCE(SUM(balance),0) as totalBalance FROM users', [], (err, userRow) => {
      if (err) {
        console.error('Error fetching users summary', err);
        return res.status(500).send('');
      }

      db.get('SELECT COUNT(*) as totalTransactions FROM transactions', [], (err2, txRow) => {
        if (err2) {
          console.error('Error fetching transactions summary', err2);
          return res.status(500).send('');
        }

        const totalUsers = userRow.totalUsers || 0;
        const totalBalance = Number(userRow.totalBalance || 0).toFixed(2);
        const totalTransactions = txRow.totalTransactions || 0;

        return res.send(`
          <div class="overview-card">
            <h3 data-i18n="dashboard.admin.overview.totalUsers">Total Users</h3>
            <p>${escapeHtml(totalUsers)}</p>
          </div>
          <div class="overview-card">
            <h3 data-i18n="dashboard.admin.overview.totalBalance">Total Balance</h3>
            <p>${escapeHtml(totalBalance)}</p>
          </div>
          <div class="overview-card">
            <h3 data-i18n="dashboard.admin.overview.totalTransactions">Total Transactions</h3>
            <p>${escapeHtml(totalTransactions)}</p>
          </div>
        `);
      });
    });
  } catch (error) {
    console.error('Overview HTML error', error);
    res.status(500).send('');
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

// Users list (HTML fragment for HTMX)
router.get('/users/html', requireAuth, requireAdmin, (req, res) => {
  const searchTerm = req.query.search ? `%${req.query.search}%` : null;
  let sql = 'SELECT id, username, role, language, balance, created_at FROM users';
  const params = [];

  if (searchTerm) {
    sql += ' WHERE username LIKE ?';
    params.push(searchTerm);
  }

  sql += ' ORDER BY id ASC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error fetching users for admin html', err);
      return res.status(500).send('');
    }

    if (!rows || rows.length === 0) {
      return res.send('<tr><td colspan="6" data-i18n="common.noData">No data</td></tr>');
    }

    const html = rows
      .map((user) => {
        const balance = Number(user.balance || 0).toFixed(2);
        return `
          <tr>
            <td>${escapeHtml(user.username)}</td>
            <td data-i18n="roles.${escapeHtml(user.role)}">${escapeHtml(user.role)}</td>
            <td>${escapeHtml((user.language || '').toUpperCase())}</td>
            <td>${escapeHtml(balance)}</td>
            <td>${escapeHtml(user.created_at)}</td>
            <td>
              <div class="table-actions">
                <button data-action="edit-user" data-id="${user.id}" data-i18n="common.edit">Edit</button>
                <button class="danger" data-action="delete-user" data-id="${user.id}" data-i18n="common.delete">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    return res.send(html);
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
