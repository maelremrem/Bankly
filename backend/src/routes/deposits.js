const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Create deposit request (user)
router.post('/', [
  requireAuth,
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('amount').isFloat({ max: 100000 }).withMessage('Amount seems too large'),
  body('reference').optional().isString().isLength({ max: 500 }).withMessage('Reference too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });

    const userId = req.user.userId;
    const { amount, reference } = req.body;

    const result = await db.runAsync(`
      INSERT INTO deposit_requests (user_id, amount, reference)
      VALUES (?, ?, ?)
    `, [userId, amount, reference || null]);

    const deposit = await db.getAsync('SELECT * FROM deposit_requests WHERE id = ?', [result.lastID]);

    res.status(201).json({ success: true, data: deposit, message: 'Deposit request submitted' });
  } catch (error) {
    logger.error('Error creating deposit request', { error: error.message, userId: req.user && req.user.userId });
    res.status(500).json({ success: false, error: 'Failed to create deposit request' });
  }
});

// Get deposit requests for a user (user or admin)
router.get('/user/:userId', [
  requireAuth,
  param('userId').isInt().withMessage('User ID must be integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });

    const targetUserId = parseInt(req.params.userId, 10);
    if (req.user.role !== 'admin' && req.user.userId !== targetUserId) return res.status(403).json({ success: false, error: 'Access denied' });

    const deposits = await db.allAsync('SELECT * FROM deposit_requests WHERE user_id = ? ORDER BY requested_at DESC', [targetUserId]);
    res.json({ success: true, data: deposits });
  } catch (error) {
    logger.error('Error fetching deposit requests', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch deposit requests' });
  }
});

// Admin: list deposits
router.get('/', [requireAuth, requireAdmin], async (req, res) => {
  try {
    const deposits = await db.allAsync('SELECT dr.*, u.username FROM deposit_requests dr JOIN users u ON dr.user_id = u.id ORDER BY dr.requested_at DESC');
    res.json({ success: true, data: deposits });
  } catch (error) {
    logger.error('Error fetching deposits', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch deposits' });
  }
});

// Admin: HTML fragment for HTMX
router.get('/html', [requireAuth, requireAdmin], async (req, res) => {
  try {
    const deposits = await db.allAsync('SELECT dr.*, u.username FROM deposit_requests dr JOIN users u ON dr.user_id = u.id ORDER BY dr.requested_at DESC');
    if (!deposits || deposits.length === 0) {
      return res.send('<tr><td colspan="6" data-i18n="common.noData">No data</td></tr>');
    }

    const html = deposits.map((d) => {
      const status = d.status || 'pending';
      const statusTagMap = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' };
      const statusClass = statusTagMap[status] || 'neutral';
      const actions = status === 'pending'
        ? `
          <button data-action="approve-deposit" data-id="${d.id}">
            <span class="btn-icon">✅</span>
            <span data-i18n="common.approve">Approve</span>
          </button>
          <button class="danger" data-action="reject-deposit" data-id="${d.id}">
            <span class="btn-icon">✖</span>
            <span data-i18n="common.reject">Reject</span>
          </button>
        `
        : '';

      return `
        <tr>
          <td>${escapeHtml(d.username || '')}</td>
          <td>${escapeHtml(Number(d.amount || 0).toFixed(2))}</td>
          <td><span class="tag ${statusClass}" data-i18n="common.${status}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(d.requested_at || '')}</td>
          <td>${escapeHtml(d.reference || '')}</td>
          <td><div class="table-actions">${actions}</div></td>
        </tr>
      `;
    }).join('');

    res.send(html);
  } catch (error) {
    logger.error('Error fetching deposits html', { error: error.message });
    res.status(500).send('');
  }
});

// Admin: approve deposit
router.post('/:id/approve', [requireAuth, requireAdmin, param('id').isInt().withMessage('Deposit ID must be an integer')], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });

    const depositId = parseInt(req.params.id);
    const adminId = req.user.userId;

    const deposit = await db.getAsync('SELECT * FROM deposit_requests WHERE id = ?', [depositId]);
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposit request not found' });
    if (deposit.status !== 'pending') return res.status(400).json({ success: false, error: 'Deposit request not pending' });

    // Begin transaction
    await db.runAsync('BEGIN');
    try {
      await db.runAsync('UPDATE deposit_requests SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?', ['approved', adminId, depositId]);
      const tx = await db.runAsync('INSERT INTO transactions (user_id, type, amount, description, created_by) VALUES (?, ?, ?, ?, ?)', [deposit.user_id, 'deposit', deposit.amount, 'Deposit approved', adminId]);
      await db.runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [deposit.amount, deposit.user_id]);
      await db.runAsync('COMMIT');
      res.json({ success: true, data: { depositId, transactionId: tx.lastID, amount: deposit.amount } });
    } catch (err) {
      await db.runAsync('ROLLBACK');
      throw err;
    }
  } catch (error) {
    logger.error('Error approving deposit', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Admin: reject deposit
router.post('/:id/reject', [requireAuth, requireAdmin, param('id').isInt().withMessage('Deposit ID must be an integer'), body('reason').optional().isLength({ max: 500 }).withMessage('Reason too long')], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });

    const depositId = parseInt(req.params.id);
    const adminId = req.user.userId;
    const reason = req.body.reason || '';

    const deposit = await db.getAsync('SELECT * FROM deposit_requests WHERE id = ?', [depositId]);
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposit request not found' });
    if (deposit.status !== 'pending') return res.status(400).json({ success: false, error: 'Deposit request not pending' });

    await db.runAsync('UPDATE deposit_requests SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?, reference = COALESCE(reference, ?) WHERE id = ?', ['rejected', adminId, reason, depositId]);

    res.json({ success: true, data: { depositId, status: 'rejected' } });
  } catch (error) {
    logger.error('Error rejecting deposit', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// User cancel deposit
router.post('/:id/cancel', [requireAuth, param('id').isInt().withMessage('Deposit ID must be an integer')], async (req, res) => {
  try {
    const depositId = parseInt(req.params.id);
    const deposit = await db.getAsync('SELECT * FROM deposit_requests WHERE id = ?', [depositId]);
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposit request not found' });
    if (deposit.user_id !== req.user.userId) return res.status(403).json({ success: false, error: 'Access denied' });
    if (deposit.status !== 'pending') return res.status(400).json({ success: false, error: 'Only pending requests can be cancelled' });

    await db.runAsync('UPDATE deposit_requests SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?', ['cancelled', req.user.userId, depositId]);
    res.json({ success: true, data: { depositId, status: 'cancelled' } });
  } catch (error) {
    logger.error('Error cancelling deposit', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
