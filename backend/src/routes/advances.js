const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const AdvanceRequestService = require('../services/advanceRequestService');
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

/**
 * POST /api/advances
 * Create a new advance request (user)
 */
router.post('/', [
  requireAuth,
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('amount').isFloat({ max: 1000 }).withMessage('Amount cannot exceed 1000')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { amount } = req.body;
    const userId = req.user.userId;

    // Check if we should skip validation (for testing)
    const skipValidation = req.headers['x-skip-validation'] === 'true';
    const skipPendingValidation = req.headers['x-skip-validation'] === 'pending';

    const advanceRequest = await AdvanceRequestService.createAdvanceRequest(userId, amount, { 
      skipValidation,
      skipPendingValidation 
    });

    res.status(201).json({
      success: true,
      data: advanceRequest,
      message: 'Advance request submitted successfully'
    });
  } catch (error) {
    logger.error('Error creating advance request', { error: error.message, userId: req.user.userId });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/advances
 * Get all advance requests (admin only)
 */
router.get('/', [requireAuth, requireAdmin], [
  query('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status'),
  query('userId').optional().isInt().withMessage('User ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.userId) filters.userId = parseInt(req.query.userId);

    const advanceRequests = await AdvanceRequestService.getAllAdvanceRequests(filters);

    res.json({
      success: true,
      data: advanceRequests
    });
  } catch (error) {
    logger.error('Error fetching advance requests', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch advance requests'
    });
  }
});

/**
 * GET /api/advances/html
 * HTML fragment for HTMX (admin only)
 */
router.get('/html', [requireAuth, requireAdmin], [
  query('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status'),
  query('userId').optional().isInt().withMessage('User ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).send('');
    }

    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.userId) filters.userId = parseInt(req.query.userId);

    const advanceRequests = await AdvanceRequestService.getAllAdvanceRequests(filters);

    if (!advanceRequests || advanceRequests.length === 0) {
      return res.send('<tr><td colspan="6" data-i18n="common.noData">No data</td></tr>');
    }

    const html = advanceRequests.map((advance) => {
      const status = advance.status || 'pending';
      const statusTagMap = {
        pending: 'warning',
        approved: 'success',
        rejected: 'danger'
      };
      const statusClass = statusTagMap[status] || 'neutral';
      const actions = status === 'pending'
        ? `
          <button data-action="approve-advance" data-id="${advance.id}" data-i18n="common.approve">Approve</button>
          <button class="danger" data-action="reject-advance" data-id="${advance.id}" data-i18n="common.reject">Reject</button>
        `
        : '';

      return `
        <tr>
          <td>${escapeHtml(advance.username || '')}</td>
          <td>${escapeHtml(Number(advance.amount || 0).toFixed(2))}</td>
          <td><span class="tag ${statusClass}" data-i18n="common.${status}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(advance.created_at || '')}</td>
          <td>${escapeHtml(advance.reason || '')}</td>
          <td><div class="table-actions">${actions}</div></td>
        </tr>
      `;
    }).join('');

    res.send(html);
  } catch (error) {
    logger.error('Error fetching advance requests html', { error: error.message });
    res.status(500).send('');
  }
});

/**
 * GET /api/advances/user/:userId
 * Get advance requests for a specific user (admin or the user themselves)
 */
router.get('/user/:userId', [
  requireAuth,
  param('userId').isInt().withMessage('User ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const targetUserId = parseInt(req.params.userId);

    // Users can only view their own requests, admins can view any
    if (req.user.role !== 'admin' && req.user.userId !== targetUserId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const advanceRequests = await AdvanceRequestService.getUserAdvanceRequests(targetUserId);

    res.json({
      success: true,
      data: advanceRequests
    });
  } catch (error) {
    logger.error('Error fetching user advance requests', {
      error: error.message,
      targetUserId: req.params.userId,
      requestingUserId: req.user.userId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch advance requests'
    });
  }
});

/**
 * POST /api/advances/:id/approve
 * Approve an advance request (admin only)
 */
router.post('/:id/approve', [
  requireAuth,
  requireAdmin,
  param('id').isInt().withMessage('Advance ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const advanceId = parseInt(req.params.id);
    const adminId = req.user.userId;

    const result = await AdvanceRequestService.approveAdvanceRequest(advanceId, adminId);

    res.json({
      success: true,
      data: result,
      message: 'Advance request approved successfully'
    });
  } catch (error) {
    logger.error('Error approving advance request', {
      error: error.message,
      advanceId: req.params.id,
      adminId: req.user.userId
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/advances/:id/reject
 * Reject an advance request (admin only)
 */
router.post('/:id/reject', [
  requireAuth,
  requireAdmin,
  param('id').isInt().withMessage('Advance ID must be an integer'),
  body('reason').optional().isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const advanceId = parseInt(req.params.id);
    const adminId = req.user.userId;
    const reason = req.body.reason || '';

    const result = await AdvanceRequestService.rejectAdvanceRequest(advanceId, adminId, reason);

    res.json({
      success: true,
      data: result,
      message: 'Advance request rejected successfully'
    });
  } catch (error) {
    logger.error('Error rejecting advance request', {
      error: error.message,
      advanceId: req.params.id,
      adminId: req.user.userId
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/advances/:id
 * Get a specific advance request (admin or the requesting user)
 */
router.get('/:id', [
  requireAuth,
  param('id').isInt().withMessage('Advance ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const advanceId = parseInt(req.params.id);
    const advanceRequest = await AdvanceRequestService.getAdvanceRequestById(advanceId);

    if (!advanceRequest) {
      return res.status(404).json({
        success: false,
        error: 'Advance request not found'
      });
    }

    // Users can only view their own requests, admins can view any
    if (req.user.role !== 'admin' && req.user.userId !== advanceRequest.user_id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: advanceRequest
    });
  } catch (error) {
    logger.error('Error fetching advance request', {
      error: error.message,
      advanceId: req.params.id,
      userId: req.user.userId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch advance request'
    });
  }
});

module.exports = router;