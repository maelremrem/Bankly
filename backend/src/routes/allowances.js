const express = require('express');
const { body, param, validationResult } = require('express-validator');
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

// GET /api/allowances - Get all allowances (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowances = await db.allAsync(`
      SELECT
        a.id,
        a.user_id,
        a.amount,
        a.frequency,
        a.next_payment_date,
        a.enabled,
        a.created_at,
        a.updated_at,
        u.username
      FROM allowances a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
    `);

    res.json({ success: true, data: allowances });
  } catch (error) {
    logger.error('Error fetching allowances', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch allowances' });
  }
});

// GET /api/allowances/html - HTML fragment for HTMX
router.get('/html', requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowances = await db.allAsync(`
      SELECT
        a.id,
        a.user_id,
        a.amount,
        a.frequency,
        a.next_payment_date,
        a.enabled,
        u.username
      FROM allowances a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
    `);

    if (!allowances || allowances.length === 0) {
      return res.send('<tr><td colspan="6" data-i18n="common.noData">No data</td></tr>');
    }

    const html = allowances.map((allowance) => {
      const statusClass = allowance.enabled ? 'success' : 'neutral';
      const statusKey = allowance.enabled ? 'common.enabled' : 'common.disabled';
      return `
        <tr>
          <td>${escapeHtml(allowance.username || '')}</td>
          <td>${escapeHtml(Number(allowance.amount || 0).toFixed(2))}</td>
          <td data-i18n="frequency.${escapeHtml(allowance.frequency)}">${escapeHtml(allowance.frequency)}</td>
          <td>${escapeHtml(allowance.next_payment_date || '')}</td>
          <td><span class="tag ${statusClass}" data-i18n="${statusKey}">${allowance.enabled ? 'Enabled' : 'Disabled'}</span></td>
          <td>
            <div class="table-actions">
              <button data-action="edit-allowance" data-id="${allowance.id}" data-i18n="common.edit">Edit</button>
              <button class="danger" data-action="delete-allowance" data-id="${allowance.id}" data-i18n="common.delete">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return res.send(html);
  } catch (error) {
    logger.error('Error fetching allowances html', { error });
    res.status(500).send('');
  }
});

// GET /api/allowances/:userId - Get allowances for specific user (admin only)
router.get('/:userId', requireAuth, requireAdmin, [
  param('userId').isInt().withMessage('Invalid user ID')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

  const { userId } = req.params;

  try {
    const allowances = await db.allAsync(`
      SELECT * FROM allowances
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [userId]);

    res.json({ success: true, data: allowances });
  } catch (error) {
    logger.error('Error fetching user allowances', { error, userId });
    res.status(500).json({ success: false, error: 'Failed to fetch user allowances' });
  }
});

// POST /api/allowances - Create allowance (admin only)
router.post('/', requireAuth, requireAdmin, [
  body('userId').isInt().withMessage('userId must be integer'),
  body('amount').isFloat({ min: 0 }).withMessage('amount must be >= 0'),
  body('frequency').isIn(['daily', 'weekly', 'monthly']).withMessage('frequency must be daily, weekly, or monthly'),
  body('enabled').optional().isBoolean().withMessage('enabled must be boolean')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

  const { userId, amount, frequency, enabled = true } = req.body;
  const createdBy = req.user.userId;

  try {
    // Check if user exists
    const user = await db.getAsync('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Calculate next payment date
    const nextPaymentDate = calculateNextPaymentDate(frequency);

    const result = await db.runAsync(`
      INSERT INTO allowances (user_id, amount, frequency, next_payment_date, enabled)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, amount, frequency, nextPaymentDate.toISOString(), enabled ? 1 : 0]);

    const allowance = await db.getAsync('SELECT * FROM allowances WHERE id = ?', [result.lastID]);

    logger.info('Allowance created', { allowanceId: result.lastID, userId, createdBy });
    res.status(201).json({ success: true, data: allowance });
  } catch (error) {
    logger.error('Error creating allowance', { error, userId, createdBy });
    res.status(500).json({ success: false, error: 'Failed to create allowance' });
  }
});

// PUT /api/allowances/:id - Update allowance (admin only)
router.put('/:id', requireAuth, requireAdmin, [
  param('id').isInt().withMessage('Invalid allowance ID'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('amount must be >= 0'),
  body('frequency').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('frequency must be daily, weekly, or monthly'),
  body('enabled').optional().isBoolean().withMessage('enabled must be boolean')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

  const { id } = req.params;
  const { amount, frequency, enabled } = req.body;

  try {
    const existingAllowance = await db.getAsync('SELECT * FROM allowances WHERE id = ?', [id]);
    if (!existingAllowance) {
      return res.status(404).json({ success: false, error: 'Allowance not found' });
    }

    const updates = {};
    if (amount !== undefined) updates.amount = amount;
    if (frequency !== undefined) {
      updates.frequency = frequency;
      updates.next_payment_date = calculateNextPaymentDate(frequency).toISOString();
    }
    if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid updates provided' });
    }

    updates.updated_at = new Date().toISOString();

    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    await db.runAsync(`UPDATE allowances SET ${setClause} WHERE id = ?`, values);

    const updatedAllowance = await db.getAsync('SELECT * FROM allowances WHERE id = ?', [id]);

    logger.info('Allowance updated', { allowanceId: id, updatedBy: req.user.userId });
    res.json({ success: true, data: updatedAllowance });
  } catch (error) {
    logger.error('Error updating allowance', { error, allowanceId: id, userId: req.user.userId });
    res.status(500).json({ success: false, error: 'Failed to update allowance' });
  }
});

// DELETE /api/allowances/:id - Delete allowance (admin only)
router.delete('/:id', requireAuth, requireAdmin, [
  param('id').isInt().withMessage('Invalid allowance ID')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

  const { id } = req.params;

  try {
    const existingAllowance = await db.getAsync('SELECT * FROM allowances WHERE id = ?', [id]);
    if (!existingAllowance) {
      return res.status(404).json({ success: false, error: 'Allowance not found' });
    }

    await db.runAsync('DELETE FROM allowances WHERE id = ?', [id]);

    logger.info('Allowance deleted', { allowanceId: id, deletedBy: req.user.userId });
    res.json({ success: true, message: 'Allowance deleted successfully' });
  } catch (error) {
    logger.error('Error deleting allowance', { error, allowanceId: id, userId: req.user.userId });
    res.status(500).json({ success: false, error: 'Failed to delete allowance' });
  }
});

// Helper function to calculate next payment date
function calculateNextPaymentDate(frequency) {
  const now = new Date();

  switch (frequency) {
    case 'daily':
      now.setDate(now.getDate() + 1);
      break;
    case 'weekly':
      now.setDate(now.getDate() + 7);
      break;
    case 'monthly':
      now.setMonth(now.getMonth() + 1);
      break;
    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }

  return now;
}

module.exports = router;