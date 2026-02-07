const express = require('express');
const db = require('../config/database');
const logger = require('../config/logger');
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
    // Exclude admin users from summary counts and balances
    db.get("SELECT COUNT(*) as totalUsers, COALESCE(SUM(balance),0) as totalBalance FROM users WHERE role != 'admin'", [], (err, userRow) => {
      if (err) {
        console.error('Error fetching users summary', err);
        return res.status(500).json({ success: false, error: 'Server error' });
      }

      // Only count transactions that belong to non-admin users
      db.get('SELECT COUNT(*) as totalTransactions FROM transactions t JOIN users u ON t.user_id = u.id WHERE u.role != ?',[ 'admin' ], (err2, txRow) => {
        if (err2) {
          console.error('Error fetching transactions summary', err2);
          return res.status(500).json({ success: false, error: 'Server error' });
        }

        // compute average allowance and pending counts (exclude admins)
        db.get("SELECT COUNT(*) as pendingAdvances FROM advance_requests ar JOIN users u ON ar.user_id = u.id WHERE ar.status = ? AND u.role != 'admin'", [ 'pending' ], (err3, advRow) => {
          if (err3) {
            console.error('Error fetching pending advances', err3);
            return res.json({ success: true, data: { totalUsers: userRow.totalUsers || 0, totalBalance: userRow.totalBalance || 0, totalTransactions: txRow.totalTransactions || 0 } });
          }

          db.get(`SELECT COALESCE(AVG(a.amount),0) as avgAllowance FROM allowances a JOIN users u ON a.user_id = u.id WHERE a.enabled = 1 AND u.role != 'admin'`, [], (err4, avgRow) => {
            const pendingAdvances = advRow ? advRow.pendingAdvances || 0 : 0;
            const avgAllowance = avgRow ? Number(avgRow.avgAllowance || 0) : 0;

            db.get(`SELECT COUNT(*) as pendingCompletions FROM task_completions tc JOIN users u ON tc.user_id = u.id WHERE tc.status = 'pending' AND u.role != 'admin'`, [], (err5, compRow) => {
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
    // Exclude admin users from HTML overview counts and balances
    db.get("SELECT COUNT(*) as totalUsers, COALESCE(SUM(balance),0) as totalBalance FROM users WHERE role != 'admin'", [], (err, userRow) => {
      if (err) {
        console.error('Error fetching users summary', err);
        return res.status(500).send('');
      }

      db.get('SELECT COUNT(*) as totalTransactions FROM transactions t JOIN users u ON t.user_id = u.id WHERE u.role != ?', ['admin'], (err2, txRow) => {
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
          <div style="grid-column:1/-1;padding:0.5rem;color:var(--muted);font-size:0.9rem;">
            <small data-i18n="dashboard.admin.overview.adminsExcluded">Admins are excluded from these totals</small>
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
      `SELECT date(t.created_at) as day, COUNT(*) as count, COALESCE(SUM(t.amount),0) as total
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       WHERE date(t.created_at) >= date('now', ?) AND u.role != 'admin'
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
      `SELECT username, balance FROM users WHERE role != 'admin' ORDER BY balance DESC LIMIT ?`,
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
      `SELECT strftime('%Y-%m', t.created_at) as month, COALESCE(SUM(t.amount),0) as total
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       WHERE t.type = 'allowance' AND date(t.created_at) >= date('now', ?) AND u.role != 'admin'
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
// ===== Refresh token management (admin) =====
// List refresh tokens (optionally filter by userId)
router.get('/refresh-tokens', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    // Join with users to include username for display
    let sql = 'SELECT r.id, r.user_id, r.created_at, r.expires_at, u.username FROM refresh_tokens r LEFT JOIN users u ON r.user_id = u.id';
    const params = [];
    if (userId) {
      sql += ' WHERE r.user_id = ?';
      params.push(userId);
    }
    sql += ' ORDER BY r.created_at DESC';

    const rows = await db.allAsync(sql, params);
    return res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Error listing refresh tokens', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Revoke a single refresh token by id
router.post('/refresh-tokens/:id/revoke', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid token id' });

    const result = await db.runAsync('DELETE FROM refresh_tokens WHERE id = ?', [id]);
    const deleted = result && result.changes ? result.changes : 0;
    if (deleted > 0) {
      const logger = require('../config/logger');
      logger.info(`admin revoked refresh token id=${id} by admin=${req.user.userId}`);
    }
    return res.json({ success: true, data: { deleted } });
  } catch (error) {
    console.error('Error revoking refresh token', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Revoke all refresh tokens for a user (body: { userId })
router.post('/refresh-tokens/revoke', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    const result = await db.runAsync('DELETE FROM refresh_tokens WHERE user_id = ?', [Number(userId)]);
    const deleted = result && result.changes ? result.changes : 0;
    const logger = require('../config/logger');
    logger.info(`admin revoked ${deleted} refresh tokens for user=${userId} by admin=${req.user.userId}`);

    return res.json({ success: true, data: { deleted } });
  } catch (error) {
    console.error('Error revoking refresh tokens by user', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
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
