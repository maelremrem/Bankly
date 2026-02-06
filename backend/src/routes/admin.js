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

        // compute average allowance and pending counts
        db.get('SELECT COUNT(*) as pendingAdvances FROM advance_requests WHERE status = ?',[ 'pending' ], (err3, advRow) => {
          if (err3) {
            console.error('Error fetching pending advances', err3);
            return res.json({ success: true, data: { totalUsers: userRow.totalUsers || 0, totalBalance: userRow.totalBalance || 0, totalTransactions: txRow.totalTransactions || 0 } });
          }

          db.get(`SELECT COALESCE(AVG(amount),0) as avgAllowance FROM allowances WHERE enabled = 1`, [], (err4, avgRow) => {
            const pendingAdvances = advRow ? advRow.pendingAdvances || 0 : 0;
            const avgAllowance = avgRow ? Number(avgRow.avgAllowance || 0) : 0;

            db.get(`SELECT COUNT(*) as pendingCompletions FROM task_completions WHERE status = 'pending'`, [], (err5, compRow) => {
              const pendingCompletions = compRow ? compRow.pendingCompletions || 0 : 0;

              return res.json({
                success: true,
                data: {
                  totalUsers: userRow.totalUsers || 0,
                  totalBalance: userRow.totalBalance || 0,
                  totalTransactions: txRow.totalTransactions || 0,
                  pendingAdvances,
                  pendingCompletions,
                  averageAllowance: Number(avgAllowance || 0)
                }
              });
            });
          });
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

// Transactions per day (last N days) - JSON for charts
router.get('/overview/transactions/daily', requireAuth, requireAdmin, (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));
    const offset = `-${days - 1} days`;

    // Aggregate by date (ISO YYYY-MM-DD)
    db.all(
      `SELECT date(created_at) as day, COUNT(*) as count, COALESCE(SUM(amount),0) as total
       FROM transactions
       WHERE date(created_at) >= date('now', ?)
       GROUP BY day
       ORDER BY day ASC`,
      [offset],
      (err, rows) => {
        if (err) {
          console.error('Error fetching daily transactions', err);
          return res.status(500).json({ success: false, error: 'Server error' });
        }
        return res.json({ success: true, data: rows || [] });
      }
    );
  } catch (error) {
    console.error('Daily transactions error', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Top user balances (for histogram / top list)
router.get('/overview/balances/top', requireAuth, requireAdmin, (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    db.all(
      `SELECT username, balance FROM users ORDER BY balance DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) {
          console.error('Error fetching top balances', err);
          return res.status(500).json({ success: false, error: 'Server error' });
        }
        return res.json({ success: true, data: rows || [] });
      }
    );
  } catch (error) {
    console.error('Top balances error', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Monthly allowances totals (last N months)
router.get('/overview/allowances/monthly', requireAuth, requireAdmin, (req, res) => {
  try {
    const months = Math.max(1, Math.min(24, parseInt(req.query.months) || 6));
    const offset = `- ${months - 1} months`;

    db.all(
      `SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(amount),0) as total
       FROM transactions
       WHERE type = 'allowance' AND date(created_at) >= date('now', ?)
       GROUP BY month
       ORDER BY month ASC`,
      [`-${months - 1} months`],
      (err, rows) => {
        if (err) {
          console.error('Error fetching monthly allowances', err);
          return res.status(500).json({ success: false, error: 'Server error' });
        }
        return res.json({ success: true, data: rows || [] });
      }
    );
  } catch (error) {
    console.error('Monthly allowances error', error);
    return res.status(500).json({ success: false, error: 'Server error' });
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
                <button data-action="edit-user" data-id="${user.id}">
                  <span class="btn-icon">✎</span>
                  <span data-i18n="common.edit">Edit</span>
                </button>
                <button class="danger" data-action="delete-user" data-id="${user.id}">
                  <span class="btn-icon">🗑</span>
                  <span data-i18n="common.delete">Delete</span>
                </button>
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
