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

// Get all tasks (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tasks = await db.allAsync(`
      SELECT id, name, description, reward_amount, requires_approval, cooldown_seconds, created_by, created_at, updated_at
      FROM tasks
      ORDER BY created_at DESC
    `);

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('Error fetching tasks', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

// Get all tasks (admin only) - HTML fragment for HTMX
router.get('/html', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tasks = await db.allAsync(`
      SELECT id, name, description, reward_amount, requires_approval, cooldown_seconds, created_at
      FROM tasks
      ORDER BY created_at DESC
    `);

    if (!tasks || tasks.length === 0) {
      return res.send('<tr><td colspan="7" data-i18n="common.noData">No data</td></tr>');
    }

    const html = tasks.map((task) => {
      const approval = task.requires_approval
        ? '<span class="tag warning" data-i18n="dashboard.admin.tasks.requiresApproval">Requires Approval</span>'
        : '<span class="tag success" data-i18n="dashboard.admin.tasks.autoApproval">Auto Approval</span>';

      const cooldownDisplay = (task.cooldown_seconds || task.cooldown_seconds === 0) ? String(task.cooldown_seconds) : '—';

      return `
        <tr>
          <td>${escapeHtml(task.name)}</td>
          <td>${escapeHtml(task.description || '')}</td>
          <td>${escapeHtml(Number(task.reward_amount || 0).toFixed(2))}</td>
          <td>${approval}</td>
          <td>${escapeHtml(cooldownDisplay)}</td>
          <td>${escapeHtml(task.created_at)}</td>
          <td>
            <div class="table-actions">
              <button data-action="edit-task" data-id="${task.id}">
                <span class="btn-icon">✎</span>
                <span data-i18n="common.edit">Edit</span>
              </button>
              <button class="danger" data-action="delete-task" data-id="${task.id}">
                <span class="btn-icon">🗑</span>
                <span data-i18n="common.delete">Delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return res.send(html);
  } catch (error) {
    logger.error('Error fetching tasks html', { error });
    res.status(500).send('');
  }
});

// Get available tasks for the current user (include user's latest completion status)
router.get('/available', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    // For now, all tasks are available to all users. We include the user's latest completion (if any)
    const tasks = await db.allAsync(`
      SELECT
        t.id,
        t.name,
        t.description,
        t.reward_amount,
        t.requires_approval,
        (SELECT status FROM task_completions tc WHERE tc.task_id = t.id AND tc.user_id = ? ORDER BY tc.submitted_at DESC LIMIT 1) as my_status,
        (SELECT id FROM task_completions tc WHERE tc.task_id = t.id AND tc.user_id = ? ORDER BY tc.submitted_at DESC LIMIT 1) as my_completion_id,
        (SELECT submitted_at FROM task_completions tc WHERE tc.task_id = t.id AND tc.user_id = ? ORDER BY tc.submitted_at DESC LIMIT 1) as my_submitted_at
      FROM tasks t
      ORDER BY t.created_at DESC
    `, [userId, userId, userId]);

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('Error fetching available tasks', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

// Create a new task (admin only)
router.post('/', requireAuth, requireAdmin, [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description max 500 characters'),
  body('reward_amount').isFloat({ min: 0 }).withMessage('Reward amount must be >= 0'),
  body('requires_approval').optional().isBoolean().withMessage('Requires approval must be boolean')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

const { name, description, reward_amount, requires_approval = true, cooldown_seconds = null } = req.body;
    const created_by = req.user.userId;
    console.log('Creating task, req.user:', req.user, 'created_by:', created_by);

    try {
      const result = await db.runAsync(`
        INSERT INTO tasks (name, description, reward_amount, requires_approval, cooldown_seconds, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [name, description, reward_amount, requires_approval ? 1 : 0, cooldown_seconds, created_by]);

    const task = await db.getAsync('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
    console.log('Inserted task result:', result, 'task:', task);

    logger.info('Task created', { taskId: task.id, createdBy: created_by });
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    logger.error('Error creating task', { error, userId: created_by });
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

// Update a task (admin only)
router.put('/:id', requireAuth, requireAdmin, [
  param('id').isInt().withMessage('Invalid task ID'),
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description max 500 characters'),
  body('reward_amount').optional().isFloat({ min: 0 }).withMessage('Reward amount must be >= 0'),
  body('requires_approval').optional().isBoolean().withMessage('Requires approval must be boolean')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

  const { id } = req.params;
const { name, description, reward_amount, requires_approval, cooldown_seconds } = req.body;

    try {
      const existingTask = await db.getAsync('SELECT * FROM tasks WHERE id = ?', [id]);
      if (!existingTask) {
        return res.status(404).json({ success: false, error: 'Task not found' });
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (reward_amount !== undefined) updates.reward_amount = reward_amount;
      if (requires_approval !== undefined) updates.requires_approval = requires_approval ? 1 : 0;
      if (cooldown_seconds !== undefined) updates.cooldown_seconds = cooldown_seconds === null ? null : Number(cooldown_seconds);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid updates provided' });
    }

    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(new Date().toISOString()); // updated_at
    values.push(id);

    await db.runAsync(`UPDATE tasks SET ${setClause}, updated_at = ? WHERE id = ?`, values);

    const updatedTask = await db.getAsync('SELECT * FROM tasks WHERE id = ?', [id]);

    logger.info('Task updated', { taskId: id, updatedBy: req.user.userId });
    res.json({ success: true, data: updatedTask });
  } catch (error) {
    logger.error('Error updating task', { error, taskId: id, userId: req.user.userId });
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

// Delete a task (admin only)
router.delete('/:id', requireAuth, requireAdmin, [
  param('id').isInt().withMessage('Invalid task ID')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

  const { id } = req.params;

  try {
    const existingTask = await db.getAsync('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existingTask) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    await db.runAsync('DELETE FROM tasks WHERE id = ?', [id]);

    logger.info('Task deleted', { taskId: id, deletedBy: req.user.userId });
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    logger.error('Error deleting task', { error, taskId: id, userId: req.user.userId });
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

// Submit task completion (user)
router.post('/:id/complete', requireAuth, [
  param('id').isInt().withMessage('Invalid task ID')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const task = await db.getAsync('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    // Enforce cooldown to prevent spamming completions
    const globalCooldown = Number(process.env.TASK_COOLDOWN_SECONDS || 0);
    const taskCooldown = (task.cooldown_seconds !== null && task.cooldown_seconds !== undefined) ? Number(task.cooldown_seconds) : globalCooldown;

    if (taskCooldown > 0) {
      // Check last completion for this user/task (ignore 'rejected' because a rejection should allow immediate retry)
      const last = await db.getAsync(`
        SELECT submitted_at, status FROM task_completions
        WHERE task_id = ? AND user_id = ?
        ORDER BY submitted_at DESC LIMIT 1
      `, [id, userId]);

      if (last && last.status !== 'rejected') {
        const lastTime = new Date(last.submitted_at).getTime();
        const now = Date.now();
        const diffSec = Math.floor((now - lastTime) / 1000);
        if (diffSec < taskCooldown) {
          const remaining = taskCooldown - diffSec;
          return res.status(429).json({ success: false, error: 'Task cooldown in effect', details: { seconds_remaining: remaining } });
        }
      }

      // For auto-approved tasks, also check recent transactions (more robust for immediate approvals)
      if (!task.requires_approval) {
        const lastTx = await db.getAsync(`
          SELECT created_at FROM transactions
          WHERE user_id = ? AND type = 'task' AND description LIKE ?
          ORDER BY created_at DESC LIMIT 1
        `, [userId, `%Task completed: ${task.name}%`]);

        if (lastTx && lastTx.created_at) {
          const lastTxTime = new Date(lastTx.created_at).getTime();
          const now = Date.now();
          const diffSecTx = Math.floor((now - lastTxTime) / 1000);
          if (diffSecTx < taskCooldown) {
            const remaining = taskCooldown - diffSecTx;
            return res.status(429).json({ success: false, error: 'Task cooldown in effect', details: { seconds_remaining: remaining } });
          }
        }
      }
    }

    // Check if user already has a pending completion for this task
    const existingCompletion = await db.getAsync(`
      SELECT * FROM task_completions
      WHERE task_id = ? AND user_id = ? AND status = 'pending'
    `, [id, userId]);

    if (existingCompletion) {
      return res.status(400).json({ success: false, error: 'Task completion already pending approval' });
    }

    const status = task.requires_approval ? 'pending' : 'approved';

    // For auto-approve tasks with cooldown, use conditional insert to avoid duplicates if a recent transaction exists
    let result;
    if (!task.requires_approval && taskCooldown > 0) {
      const inserted = await db.runAsync(`
        INSERT INTO task_completions (task_id, user_id, status)
        SELECT ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM transactions
          WHERE user_id = ? AND type = 'task' AND description LIKE ? AND created_at > datetime('now', ?)
        )
      `, [id, userId, status, userId, `%Task completed: ${task.name}%`, `-${taskCooldown} seconds`]);

      // sqlite returns changes==0 if insert skipped
      if (!inserted || inserted.changes === 0) {
        return res.status(429).json({ success: false, error: 'Task cooldown in effect', details: { seconds_remaining: taskCooldown } });
      }
      result = inserted;
    } else {
      result = await db.runAsync(`
        INSERT INTO task_completions (task_id, user_id, status)
        VALUES (?, ?, ?)
      `, [id, userId, status]);
    }

    if (!task.requires_approval) {
      // Auto-approve: create transaction — perform tx-check inside DB transaction to prevent race/duplicate creations
      await db.runAsync('BEGIN');
      try {
        // Re-check most recent task transaction for this user/task inside the transaction
        const lastTx = await db.getAsync(`
          SELECT created_at FROM transactions
          WHERE user_id = ? AND type = 'task' AND description LIKE ?
          ORDER BY created_at DESC LIMIT 1
        `, [userId, `%Task completed: ${task.name}%`]);

        if (lastTx && lastTx.created_at && taskCooldown > 0) {
          const lastTxTime = new Date(lastTx.created_at).getTime();
          const now = Date.now();
          const diffSecTx = Math.floor((now - lastTxTime) / 1000);
          if (diffSecTx < taskCooldown) {
            await db.runAsync('ROLLBACK');
            const remaining = taskCooldown - diffSecTx;
            return res.status(429).json({ success: false, error: 'Task cooldown in effect', details: { seconds_remaining: remaining } });
          }
        }

        const transactionResult = await db.runAsync(`
          INSERT INTO transactions (user_id, type, amount, description, created_by)
          VALUES (?, 'task', ?, ?, ?)
        `, [userId, task.reward_amount, `Task completed: ${task.name}`, req.user.userId]);

        await db.runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [task.reward_amount, userId]);

        await db.runAsync('COMMIT');

        logger.info('Task auto-approved and transaction created', {
          taskId: id,
          userId,
          transactionId: transactionResult.lastID,
          amount: task.reward_amount
        });
      } catch (txError) {
        await db.runAsync('ROLLBACK');
        throw txError;
      }
    }

    const completion = await db.getAsync('SELECT * FROM task_completions WHERE id = ?', [result.lastID]);

    logger.info('Task completion submitted', { taskId: id, userId, status });
    res.status(201).json({ success: true, data: completion });
  } catch (error) {
    logger.error('Error submitting task completion', { error, taskId: id, userId });
    res.status(500).json({ success: false, error: 'Failed to submit task completion' });
  }
});

// Get task completions (admin only)
router.get('/:id/completions', requireAuth, requireAdmin, [
  param('id').isInt().withMessage('Invalid task ID')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

  const { id } = req.params;

  try {
    const task = await db.getAsync('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const completions = await db.allAsync(`
      SELECT tc.*, u.username, t.name as task_name
      FROM task_completions tc
      JOIN users u ON tc.user_id = u.id
      JOIN tasks t ON tc.task_id = t.id
      WHERE tc.task_id = ?
      ORDER BY tc.submitted_at DESC
    `, [id]);

    res.json({ success: true, data: completions });
  } catch (error) {
    logger.error('Error fetching task completions', { error, taskId: id });
    res.status(500).json({ success: false, error: 'Failed to fetch task completions' });
  }
});

// Get task completions (admin only) - HTML fragment for HTMX
router.get('/:id/completions/html', requireAuth, requireAdmin, [
  param('id').isInt().withMessage('Invalid task ID')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send('');
  }

  const { id } = req.params;

  try {
    const completions = await db.allAsync(`
      SELECT tc.*, u.username, t.name as task_name
      FROM task_completions tc
      JOIN users u ON tc.user_id = u.id
      JOIN tasks t ON tc.task_id = t.id
      WHERE tc.task_id = ?
      ORDER BY tc.submitted_at DESC
    `, [id]);

    if (!completions || completions.length === 0) {
      return res.send('<tr><td colspan="5" data-i18n="common.noData">No data</td></tr>');
    }

    const html = completions.map((completion) => {
      const status = completion.status || 'pending';
      const statusTagMap = {
        pending: 'warning',
        approved: 'success',
        rejected: 'danger'
      };
      const statusClass = statusTagMap[status] || 'neutral';
      const actions = status === 'pending'
        ? `
          <button data-action="approve-completion" data-id="${completion.id}">
            <span class="btn-icon">✅</span>
            <span data-i18n="common.approve">Approve</span>
          </button>
          <button class="danger" data-action="reject-completion" data-id="${completion.id}">
            <span class="btn-icon">✖</span>
            <span data-i18n="common.reject">Reject</span>
          </button>
        `
        : '';

      return `
        <tr>
          <td>${escapeHtml(completion.username || '')}</td>
          <td>${escapeHtml(completion.task_name || '')}</td>
          <td><span class="tag ${statusClass}" data-i18n="common.${status}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(completion.submitted_at || completion.created_at || '')}</td>
          <td><div class="table-actions">${actions}</div></td>
        </tr>
      `;
    }).join('');

    return res.send(html);
  } catch (error) {
    logger.error('Error fetching task completions html', { error, taskId: id });
    res.status(500).send('');
  }
});

// Get all task completions (admin only) - HTML fragment for HTMX
router.get('/completions/html', requireAuth, requireAdmin, async (req, res) => {
  try {
    const completions = await db.allAsync(`
      SELECT tc.*, u.username, t.name as task_name, t.requires_approval
      FROM task_completions tc
      JOIN users u ON tc.user_id = u.id
      JOIN tasks t ON tc.task_id = t.id
      ORDER BY tc.submitted_at DESC
    `);

    if (!completions || completions.length === 0) {
      return res.send('<tr><td colspan="5" data-i18n="common.noData">No data</td></tr>');
    }

    const html = completions.map((completion) => {
      const status = completion.status || 'pending';
      let statusText = status;
      let statusClass = 'neutral';

      if (status === 'approved') {
        // Distinguish between manual approval and auto-approval
        statusClass = 'success';
        statusText = completion.requires_approval ? 'approved' : 'autoApproved';
      } else {
        const statusTagMap = {
          pending: 'warning',
          rejected: 'danger'
        };
        statusClass = statusTagMap[status] || 'neutral';
      }

      return `
        <tr>
          <td>${escapeHtml(completion.username || '')}</td>
          <td>${escapeHtml(completion.task_name || '')}</td>
          <td><span class="tag ${statusClass}" data-i18n="common.${statusText}">${escapeHtml(statusText)}</span></td>
          <td>${escapeHtml(completion.submitted_at || completion.created_at || '')}</td>
          <td>${escapeHtml(completion.reviewed_at || '')}</td>
        </tr>
      `;
    }).join('');

    return res.send(html);
  } catch (error) {
    logger.error('Error fetching all task completions html', { error });
    res.status(500).send('');
  }
});

// Get pending task completions (admin only) - HTML fragment for HTMX
router.get('/completions/pending/html', requireAuth, requireAdmin, async (req, res) => {
  try {
    const completions = await db.allAsync(`
      SELECT tc.*, u.username, t.name as task_name
      FROM task_completions tc
      JOIN users u ON tc.user_id = u.id
      JOIN tasks t ON tc.task_id = t.id
      WHERE tc.status = 'pending'
      ORDER BY tc.submitted_at DESC
    `);

    if (!completions || completions.length === 0) {
      return res.send('<tr><td colspan="5" data-i18n="common.noData">No data</td></tr>');
    }

    const html = completions.map((completion) => {
      const status = completion.status || 'pending';
      const statusTagMap = {
        pending: 'warning',
        approved: 'success',
        rejected: 'danger'
      };
      const statusClass = statusTagMap[status] || 'neutral';
      const actions = status === 'pending'
        ? `
          <button data-action="approve-completion" data-id="${completion.id}">
            <span class="btn-icon">✅</span>
            <span data-i18n="common.approve">Approve</span>
          </button>
          <button class="danger" data-action="reject-completion" data-id="${completion.id}">
            <span class="btn-icon">✖</span>
            <span data-i18n="common.reject">Reject</span>
          </button>
        `
        : '';

      return `
        <tr>
          <td>${escapeHtml(completion.username || '')}</td>
          <td>${escapeHtml(completion.task_name || '')}</td>
          <td><span class="tag ${statusClass}" data-i18n="common.${status}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(completion.submitted_at || completion.created_at || '')}</td>
          <td><div class="table-actions">${actions}</div></td>
        </tr>
      `;
    }).join('');

    return res.send(html);
  } catch (error) {
    logger.error('Error fetching pending task completions html', { error });
    res.status(500).send('');
  }
});

// Approve or reject task completion (admin only)
router.post('/completions/:completionId/approve', requireAuth, requireAdmin, [
  param('completionId').isInt().withMessage('Invalid completion ID'),
  body('approved').isBoolean().withMessage('Approved must be boolean'),
  body('review_notes').optional().trim().isLength({ max: 500 }).withMessage('Review notes max 500 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }

  const { completionId } = req.params;
  const { approved, review_notes } = req.body;
  const reviewedBy = req.user.userId;

  try {
    const completion = await db.getAsync('SELECT * FROM task_completions WHERE id = ?', [completionId]);
    if (!completion) {
      return res.status(404).json({ success: false, error: 'Task completion not found' });
    }

    if (completion.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Task completion already reviewed' });
    }

    const newStatus = approved ? 'approved' : 'rejected';

    await db.runAsync(`
      UPDATE task_completions
      SET status = ?, reviewed_at = ?, reviewed_by = ?, review_notes = ?
      WHERE id = ?
    `, [newStatus, new Date().toISOString(), reviewedBy, review_notes || null, completionId]);

    if (approved) {
      // Get task details for reward
      const task = await db.getAsync('SELECT * FROM tasks WHERE id = ?', [completion.task_id]);

      // Create transaction
      await db.runAsync('BEGIN');
      try {
        const transactionResult = await db.runAsync(`
          INSERT INTO transactions (user_id, type, amount, description, created_by)
          VALUES (?, 'task', ?, ?, ?)
        `, [completion.user_id, task.reward_amount, `Task completed: ${task.name}`, reviewedBy]);

        await db.runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [task.reward_amount, completion.user_id]);

        await db.runAsync('COMMIT');

        logger.info('Task completion approved and transaction created', {
          completionId,
          userId: completion.user_id,
          transactionId: transactionResult.lastID,
          amount: task.reward_amount
        });
      } catch (txError) {
        await db.runAsync('ROLLBACK');
        throw txError;
      }
    }

    const updatedCompletion = await db.getAsync('SELECT * FROM task_completions WHERE id = ?', [completionId]);

    logger.info('Task completion reviewed', { completionId, status: newStatus, reviewedBy });
    res.json({ success: true, data: updatedCompletion });
  } catch (error) {
    logger.error('Error reviewing task completion', { error, completionId, reviewedBy });
    res.status(500).json({ success: false, error: 'Failed to review task completion' });
  }
});

function getDefaultTasks(language = 'en') {
  const defaultTasks = {
    en: [
      { name: 'Clean your room', description: 'Tidy up your bedroom and make your bed', reward_amount: 5.00, requires_approval: 1 },
      { name: 'Do the dishes', description: 'Wash and dry all the dishes', reward_amount: 3.00, requires_approval: 1 },
      { name: 'Take out the trash', description: 'Empty the kitchen trash and take it outside', reward_amount: 2.00, requires_approval: 0 },
      { name: 'Walk the dog', description: 'Take the dog for a 20-minute walk', reward_amount: 4.00, requires_approval: 1 },
      { name: 'Help with groceries', description: 'Help carry groceries from the car to the kitchen', reward_amount: 2.50, requires_approval: 0 },
      { name: 'Water the plants', description: 'Water all the indoor and outdoor plants', reward_amount: 3.00, requires_approval: 0 },
      { name: 'Fold laundry', description: 'Fold and put away your clean clothes', reward_amount: 4.00, requires_approval: 1 },
      { name: 'Vacuum the living room', description: 'Vacuum the carpet in the living room', reward_amount: 5.00, requires_approval: 1 }
    ],
    fr: [
      { name: 'Ranger sa chambre', description: 'Ranger sa chambre et faire son lit', reward_amount: 5.00, requires_approval: 1 },
      { name: 'Faire la vaisselle', description: 'Laver et essuyer toute la vaisselle après le dîner', reward_amount: 3.00, requires_approval: 1 },
      { name: 'Sortir les poubelles', description: 'Vider la poubelle de la cuisine et la sortir', reward_amount: 2.00, requires_approval: 0 },
      { name: 'Promener le chien', description: 'Promener le chien pendant 20 minutes', reward_amount: 4.00, requires_approval: 1 },
      { name: 'Aider avec les courses', description: 'Aider à porter les courses de la voiture à la cuisine', reward_amount: 2.50, requires_approval: 0 },
      { name: 'Arroser les plantes', description: 'Arroser toutes les plantes d\'intérieur et d\'extérieur', reward_amount: 3.00, requires_approval: 0 },
      { name: 'Plier le linge', description: 'Plier et ranger ses vêtements propres', reward_amount: 4.00, requires_approval: 1 },
      { name: 'Passer l\'aspirateur dans le salon', description: 'Aspirer la moquette du salon', reward_amount: 5.00, requires_approval: 1 }
    ]
  };

  return defaultTasks[language] || defaultTasks.en;
}

// Generate default tasks (admin only)
router.post('/generate-default', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { language = 'en' } = req.body;
    const adminId = req.user.userId;

    const defaultTasks = getDefaultTasks(language);

    // Check if any default tasks already exist to avoid duplicates
    const existingTasks = await db.allAsync('SELECT name FROM tasks');
    const existingNames = new Set(existingTasks.map(t => t.name.toLowerCase()));

    const tasksToCreate = defaultTasks.filter(task => !existingNames.has(task.name.toLowerCase()));

    if (tasksToCreate.length === 0) {
      return res.json({ success: true, message: 'All default tasks already exist', data: [] });
    }

    const createdTasks = [];

    for (const task of tasksToCreate) {
      const result = await db.runAsync(`
        INSERT INTO tasks (name, description, reward_amount, requires_approval, created_by)
        VALUES (?, ?, ?, ?, ?)
      `, [task.name, task.description, task.reward_amount, task.requires_approval, adminId]);

      createdTasks.push({
        id: result.lastID,
        ...task,
        created_at: new Date().toISOString()
      });
    }

    logger.info('Default tasks generated', { count: createdTasks.length, language, adminId });
    res.json({ success: true, data: createdTasks, message: `${createdTasks.length} default tasks created` });
  } catch (error) {
    logger.error('Error generating default tasks', { error });
    res.status(500).json({ success: false, error: 'Failed to generate default tasks' });
  }
});

module.exports = router;