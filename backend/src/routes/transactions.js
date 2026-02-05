const express = require('express');
const { body, validationResult } = require('express-validator');
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

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// GET /api/transactions - Get all transactions (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      userId,
      type,
      startDate,
      endDate
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let whereClause = '';

    // Build WHERE clause
    const conditions = [];
    if (userId) {
      conditions.push('t.user_id = ?');
      params.push(parseInt(userId));
    }
    if (type) {
      conditions.push('t.type = ?');
      params.push(type);
    }
    if (startDate) {
      conditions.push('t.created_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('t.created_at <= ?');
      params.push(endDate);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM transactions t
      ${whereClause}
    `;
    const countResult = await getAsync(countQuery, params);
    const total = countResult.total;

    // Get transactions with user info
    const dataQuery = `
      SELECT
        t.id,
        t.user_id,
        t.type,
        t.amount,
        t.description,
        t.created_at,
        t.created_by,
        u.username,
        u.role
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, parseInt(limit), offset];
    const transactions = await allAsync(dataQuery, dataParams);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: {
        transactions,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

// GET /api/transactions/html - HTML fragment for HTMX
router.get('/html', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      limit = 50,
      userId,
      type,
      startDate,
      endDate
    } = req.query;

    const params = [];
    let whereClause = '';
    const conditions = [];

    if (userId) {
      conditions.push('t.user_id = ?');
      params.push(parseInt(userId));
    }
    if (type) {
      conditions.push('t.type = ?');
      params.push(type);
    }
    if (startDate) {
      conditions.push('t.created_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('t.created_at <= ?');
      params.push(endDate);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const dataQuery = `
      SELECT
        t.id,
        t.user_id,
        t.type,
        t.amount,
        t.description,
        t.created_at,
        u.username
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ?
    `;

    const dataParams = [...params, parseInt(limit)];
    const transactions = await allAsync(dataQuery, dataParams);

    if (!transactions || transactions.length === 0) {
      return res.send('<tr><td colspan="6" data-i18n="common.noData">No data</td></tr>');
    }

    const html = transactions.map((tx) => {
      const canReverse = !['reversal', 'reversal_undo'].includes(tx.type);
      const reverseButton = canReverse
        ? `<button data-action="reverse-transaction" data-id="${tx.id}" data-i18n="dashboard.admin.transactions.reverse">Reverse</button>`
        : '';

      return `
        <tr>
          <td>${escapeHtml(tx.created_at)}</td>
          <td>${escapeHtml(tx.username || '')}</td>
          <td>${escapeHtml(tx.type)}</td>
          <td>${escapeHtml(Number(tx.amount || 0).toFixed(2))}</td>
          <td>${escapeHtml(tx.description || '')}</td>
          <td><div class="table-actions">${reverseButton}</div></td>
        </tr>
      `;
    }).join('');

    return res.send(html);
  } catch (error) {
    console.error('Error fetching transactions html:', error);
    res.status(500).send('');
  }
});

// POST /api/transactions - create manual transaction and update balance (admin only)
router.post(
  '/',
  requireAuth,
  requireAdmin,
  body('userId').isInt().withMessage('userId must be integer'),
  body('amount').isNumeric().withMessage('amount must be numeric'),
  body('type').isString().withMessage('type is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array() });

    const { userId, amount, type, description = null } = req.body;
    const adminId = req.user && req.user.userId ? req.user.userId : null;

    try {
      const user = await getAsync('SELECT id, balance FROM users WHERE id = ?', [userId]);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      // Begin transaction
      await runAsync('BEGIN TRANSACTION');
      try {
        // Insert transaction record
        const insert = await runAsync(
          'INSERT INTO transactions (user_id, type, amount, description, created_by) VALUES (?, ?, ?, ?, ?)',
          [userId, type, amount, description, adminId]
        );

        // Update user balance
        const update = await runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, userId]);

        // Commit
        await runAsync('COMMIT');

        // Return new balance
        const updatedUser = await getAsync('SELECT id, balance FROM users WHERE id = ?', [userId]);
        return res.status(201).json({ success: true, data: { transactionId: insert.lastID, balance: updatedUser.balance } });
      } catch (innerErr) {
        console.error('Transaction failed, rolling back', innerErr);
        try {
          await runAsync('ROLLBACK');
        } catch (rbErr) {
          console.error('Rollback failed', rbErr);
        }
        return res.status(500).json({ success: false, error: 'Transaction failed' });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

// Reverse a transaction (admin or user with can_reverse)
const { requireCanReverse } = require('../middleware/auth');
router.post('/:id/reverse', requireAuth, requireCanReverse, async (req, res) => {
  const origId = Number(req.params.id);
  if (isNaN(origId)) return res.status(400).json({ success: false, error: 'Invalid transaction id' });

  try {
    // fetch original transaction
    const orig = await getAsync('SELECT * FROM transactions WHERE id = ?', [origId]);
    if (!orig) return res.status(404).json({ success: false, error: 'Original transaction not found' });

    // Check if already reversed
    const existing = await getAsync('SELECT * FROM transaction_reversals WHERE original_transaction_id = ?', [origId]);
    if (existing) return res.status(409).json({ success: false, error: 'Transaction already reversed' });

    // Begin transaction
    await runAsync('BEGIN TRANSACTION');
    try {
      // Insert reversal transaction with opposite amount
      const reversal = await runAsync(
        'INSERT INTO transactions (user_id, type, amount, description, created_by) VALUES (?, ?, ?, ?, ?)',
        [orig.user_id, 'reversal', -orig.amount, `Reversal of transaction ${origId}: ${orig.description || ''}`, req.user.userId]
      );

      // Update user balance
      await runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [-orig.amount, orig.user_id]);

      // Record reversal audit
      await runAsync(
        'INSERT INTO transaction_reversals (original_transaction_id, reversal_transaction_id, reversed_by) VALUES (?, ?, ?)',
        [origId, reversal.lastID, req.user.userId]
      );

      await runAsync('COMMIT');

      const updated = await getAsync('SELECT id, balance FROM users WHERE id = ?', [orig.user_id]);
      return res.status(201).json({ success: true, data: { reversalTransactionId: reversal.lastID, balance: updated.balance } });
    } catch (inner) {
      console.error('Reversal failed, rolling back', inner);
      try {
        await runAsync('ROLLBACK');
      } catch (rb) {
        console.error('Rollback failed', rb);
      }
      return res.status(500).json({ success: false, error: 'Reversal failed' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Undo a reversal (admin or user with can_reverse)
router.post('/reversals/:originalId/undo', requireAuth, requireCanReverse, async (req, res) => {
  const originalId = Number(req.params.originalId);
  if (isNaN(originalId)) return res.status(400).json({ success: false, error: 'Invalid original transaction id' });

  try {
    // find reversal record
    const rev = await getAsync('SELECT * FROM transaction_reversals WHERE original_transaction_id = ? AND reverted = 0', [originalId]);
    if (!rev) return res.status(404).json({ success: false, error: 'No reversible reversal found for this transaction' });

    // fetch original transaction
    const orig = await getAsync('SELECT * FROM transactions WHERE id = ?', [originalId]);
    if (!orig) return res.status(404).json({ success: false, error: 'Original transaction not found' });

    // Begin transaction
    await runAsync('BEGIN TRANSACTION');
    try {
      // Create undo transaction that reapplies original amount
      const undoTx = await runAsync(
        'INSERT INTO transactions (user_id, type, amount, description, created_by) VALUES (?, ?, ?, ?, ?)',
        [orig.user_id, 'reversal_undo', orig.amount, `Undo reversal of transaction ${originalId}`, req.user.userId]
      );

      // Update user balance
      await runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [orig.amount, orig.user_id]);

      // Mark reversal as reverted with audit
      await runAsync('UPDATE transaction_reversals SET reverted = 1, reverted_by = ?, reverted_at = CURRENT_TIMESTAMP WHERE id = ?', [req.user.userId, rev.id]);

      await runAsync('COMMIT');

      const updated = await getAsync('SELECT id, balance FROM users WHERE id = ?', [orig.user_id]);
      return res.status(201).json({ success: true, data: { undoTransactionId: undoTx.lastID, balance: updated.balance } });
    } catch (inner) {
      console.error('Undo failed, rolling back', inner);
      try {
        await runAsync('ROLLBACK');
      } catch (rb) {
        console.error('Rollback failed', rb);
      }
      return res.status(500).json({ success: false, error: 'Undo failed' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// List reversals (admin only) with pagination and filters
router.get('/reversals', requireAuth, requireAdmin, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const userId = req.query.userId ? Number(req.query.userId) : null;
  const originalId = req.query.originalId ? Number(req.query.originalId) : null;
  const reverted = req.query.reverted !== undefined ? (req.query.reverted === '1' || req.query.reverted === 'true' ? 1 : 0) : null;

  let countSql = 'SELECT COUNT(*) as count FROM transaction_reversals WHERE 1=1';
  let dataSql = 'SELECT * FROM transaction_reversals WHERE 1=1';
  const paramsCount = [];
  const paramsData = [];

  if (userId) {
    countSql += ' AND EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_reversals.original_transaction_id AND t.user_id = ?)';
    dataSql += ' AND EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_reversals.original_transaction_id AND t.user_id = ?)';
    paramsCount.push(userId);
    paramsData.push(userId);
  }
  if (originalId) {
    countSql += ' AND original_transaction_id = ?';
    dataSql += ' AND original_transaction_id = ?';
    paramsCount.push(originalId);
    paramsData.push(originalId);
  }
  if (reverted !== null) {
    countSql += ' AND reverted = ?';
    dataSql += ' AND reverted = ?';
    paramsCount.push(reverted);
    paramsData.push(reverted);
  }

  dataSql += ' ORDER BY reversed_at DESC LIMIT ? OFFSET ?';
  paramsData.push(limit, offset);

  db.get(countSql, paramsCount, (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    const total = row ? row.count : 0;
    db.all(dataSql, paramsData, (err2, rows) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
      const totalPages = Math.ceil(total / limit);
      return res.json({ success: true, data: { reversals: rows, meta: { total, page, limit, totalPages } } });
    });
  });
});

// GET /api/transactions/reversals/html - HTML fragment for HTMX
router.get('/reversals/html', requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = 0;

  const dataSql = 'SELECT * FROM transaction_reversals ORDER BY reversed_at DESC LIMIT ? OFFSET ?';
  const paramsData = [limit, offset];

  db.all(dataSql, paramsData, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).send('');
    }
    if (!rows || rows.length === 0) {
      return res.send('<tr><td colspan="6" data-i18n="common.noData">No data</td></tr>');
    }

    const html = rows.map((rev) => {
      const revertedLabel = rev.reverted ? 'Yes' : 'No';
      const undoButton = rev.reverted
        ? ''
        : `<button data-action="undo-reversal" data-id="${rev.original_transaction_id}" data-i18n="dashboard.admin.reversals.undo">Undo</button>`;

      return `
        <tr>
          <td>${escapeHtml(rev.original_transaction_id)}</td>
          <td>${escapeHtml(rev.reversal_transaction_id)}</td>
          <td>${escapeHtml(rev.reversed_by || '')}</td>
          <td>${escapeHtml(rev.reversed_at || '')}</td>
          <td data-i18n="common.${rev.reverted ? 'yes' : 'no'}">${revertedLabel}</td>
          <td><div class="table-actions">${undoButton}</div></td>
        </tr>
      `;
    }).join('');

    return res.send(html);
  });
});

// Get reversal details (admin only)
router.get('/reversals/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });

  try {
    const rev = await getAsync('SELECT * FROM transaction_reversals WHERE id = ?', [id]);
    if (!rev) return res.status(404).json({ success: false, error: 'Reversal not found' });

    // fetch original and reversal transaction rows
    const original = await getAsync('SELECT * FROM transactions WHERE id = ?', [rev.original_transaction_id]);
    const reversalTx = await getAsync('SELECT * FROM transactions WHERE id = ?', [rev.reversal_transaction_id]);

    return res.json({ success: true, data: { reversal: rev, original, reversalTx } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
