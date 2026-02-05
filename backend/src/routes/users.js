const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Create user (admin only)
router.post(
  '/',
  requireAuth,
  requireAdmin,
  body('username').isLength({ min: 3 }).withMessage('username must be at least 3 chars'),
  body('password').isLength({ min: 6 }).withMessage('password must be at least 6 chars'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array() });
    }

    const { username, password, role = 'user', language = 'en' } = req.body;
    try {
      // Check unique username
      db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ success: false, error: 'Server error' });
        }
        if (row) return res.status(409).json({ success: false, error: 'Username already exists' });

        const password_hash = await bcrypt.hash(password, 10);
        db.run(
          'INSERT INTO users (username, password_hash, role, language) VALUES (?, ?, ?, ?)',
          [username, password_hash, role, language],
          function (err2) {
            if (err2) {
              console.error(err2);
              return res.status(500).json({ success: false, error: 'Server error' });
            }
            return res.status(201).json({ success: true, data: { id: this.lastID, username, role, language } });
          }
        );
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

// List users (admin only) with pagination and optional search
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const searchTerm = req.query.search ? `%${req.query.search}%` : null;

  let countSql = 'SELECT COUNT(*) as count FROM users';
  let dataSql = 'SELECT id, username, role, language, balance, created_at FROM users';
  const countParams = [];
  const dataParams = [];

  if (searchTerm) {
    countSql += ' WHERE username LIKE ?';
    dataSql += ' WHERE username LIKE ?';
    countParams.push(searchTerm);
    dataParams.push(searchTerm);
  }

  dataSql += ' ORDER BY id ASC LIMIT ? OFFSET ?';
  dataParams.push(limit, offset);

  db.get(countSql, countParams, (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    const total = row ? row.count : 0;
    db.all(dataSql, dataParams, (err2, rows) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
      const totalPages = Math.ceil(total / limit);
      return res.json({
        success: true,
        data: {
          users: rows,
          meta: { total, page, limit, totalPages },
        },
      });
    });
  });
});

// Update user (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, password, role, language } = req.body;

  try {
    // Check user exists
    db.get('SELECT * FROM users WHERE id = ?', [id], async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      const updates = [];
      const params = [];

      if (username && username !== user.username) {
        // check uniqueness
        db.get('SELECT id FROM users WHERE username = ?', [username], (err2, existing) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ success: false, error: 'Server error' });
          }
          if (existing) return res.status(409).json({ success: false, error: 'Username already exists' });

          if (password) {
            bcrypt.hash(password, 10).then((password_hash) => {
              updates.push('password_hash = ?');
              params.push(password_hash);

              updates.push('username = ?');
              params.push(username);
              if (role) {
                updates.push('role = ?');
                params.push(role);
              }
              if (language) {
                updates.push('language = ?');
                params.push(language);
              }

              params.push(id);
              const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
              db.run(sql, params, function (err3) {
                if (err3) {
                  console.error(err3);
                  return res.status(500).json({ success: false, error: 'Server error' });
                }
                return res.json({ success: true, data: { id: Number(id), username, role: role || user.role, language: language || user.language } });
              });
            });
          } else {
            if (role) {
              updates.push('role = ?');
              params.push(role);
            }
            if (language) {
              updates.push('language = ?');
              params.push(language);
            }
            updates.push('username = ?');
            params.push(username);

            params.push(id);
            const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            db.run(sql, params, function (err3) {
              if (err3) {
                console.error(err3);
                return res.status(500).json({ success: false, error: 'Server error' });
              }
              return res.json({ success: true, data: { id: Number(id), username, role: role || user.role, language: language || user.language } });
            });
          }
        });
      } else {
        // username unchanged or not provided
        if (password) {
          const password_hash = await bcrypt.hash(password, 10);
          updates.push('password_hash = ?');
          params.push(password_hash);
        }
        if (role) {
          updates.push('role = ?');
          params.push(role);
        }
        if (language) {
          updates.push('language = ?');
          params.push(language);
        }
        if (updates.length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update' });
        params.push(id);
        const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        db.run(sql, params, function (err4) {
          if (err4) {
            console.error(err4);
            return res.status(500).json({ success: false, error: 'Server error' });
          }
          return res.json({ success: true, data: { id: Number(id), username: username || user.username, role: role || user.role, language: language || user.language } });
        });
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  db.get('SELECT id FROM users WHERE id = ?', [id], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    db.run('DELETE FROM users WHERE id = ?', [id], function (err2) {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ success: false, error: 'Server error' });
      }
      return res.json({ success: true });
    });
  });
});

// Get balance for a user (admin or the user themselves)
router.get('/:id/balance', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid user id' });

  // only admin or owner
  if (req.user.role !== 'admin' && req.user.userId !== id) return res.status(403).json({ success: false, error: 'Forbidden' });

  db.get('SELECT balance FROM users WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
    if (!row) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: { balance: row.balance } });
  });
});

// Get transactions for a user (admin or the user themselves)
router.get('/:id/transactions', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid user id' });

  // only admin or owner
  if (req.user.role !== 'admin' && req.user.userId !== id) return res.status(403).json({ success: false, error: 'Forbidden' });

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const type = req.query.type || null;

  let countSql = 'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?';
  let dataSql = 'SELECT id, type, amount, description, created_by, created_at FROM transactions WHERE user_id = ?';
  const paramsCount = [id];
  const paramsData = [id];

  if (type) {
    countSql += ' AND type = ?';
    dataSql += ' AND type = ?';
    paramsCount.push(type);
    paramsData.push(type);
  }

  dataSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
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
      return res.json({ success: true, data: { transactions: rows, meta: { total, page, limit, totalPages } } });
    });
  });
});

module.exports = router;
