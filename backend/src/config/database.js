const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const dbFile = process.env.DATABASE_FILE || path.join(__dirname, '..', '..', 'data', 'bankly.db');
const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(dbFile);

// Promisify database operations for easier use
const dbRun = (sql, params = []) => {
  const maxRetries = 5;
  const baseDelay = 20; // ms
  return new Promise((resolve, reject) => {
    const attempt = (triesLeft) => {
      db.run(sql, params, function(err) {
        if (err) {
          // Retry transient SQLITE_BUSY errors briefly
          if ((err.code === 'SQLITE_BUSY' || (err.message && err.message.includes('SQLITE_BUSY'))) && triesLeft > 0) {
            setTimeout(() => attempt(triesLeft - 1), baseDelay);
          } else {
            reject(err);
          }
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    };
    attempt(maxRetries);
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Attach promisified methods
db.runAsync = dbRun;
db.getAsync = dbGet;
db.allAsync = dbAll;

// Initialize schema if needed
const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql, (err) => {
    if (err) console.error('Failed to initialize DB schema', err);

    // Ensure users table has can_reverse column (migration for existing DBs)
    db.all("PRAGMA table_info('users')", (err2, cols) => {
      if (err2) return console.error('Failed to read users table info', err2);
      const hasCanReverse = cols && cols.some((c) => c.name === 'can_reverse');
      if (!hasCanReverse) {
        db.exec("ALTER TABLE users ADD COLUMN can_reverse INTEGER DEFAULT 0", (err3) => {
          if (err3) console.error('Migration failed for can_reverse', err3);
          else console.log('Migration: added users.can_reverse');
        });
      }

      // Ensure transaction_reversals has reverted columns
      db.all("PRAGMA table_info('transaction_reversals')", (err4, revCols) => {
        if (err4) return console.error('Failed to read transaction_reversals table info', err4);
        const hasReverted = revCols && revCols.some((c) => c.name === 'reverted');
        if (!hasReverted) {
          db.exec('ALTER TABLE transaction_reversals ADD COLUMN reverted INTEGER NOT NULL DEFAULT 0', (err5) => {
            if (err5) console.error('Migration failed for reverted', err5);
            else {
              db.exec('ALTER TABLE transaction_reversals ADD COLUMN reverted_by INTEGER', (err6) => {
                if (err6) console.error('Migration failed for reverted_by', err6);
                else {
                  db.exec('ALTER TABLE transaction_reversals ADD COLUMN reverted_at DATETIME', (err7) => {
                    if (err7) console.error('Migration failed for reverted_at', err7);
                    else console.log('Migration: added transaction_reversals.reverted* columns');
                  });
                }
              });
            }
          });
        }
      });

      // Ensure refresh_tokens table exists for refresh token handling
      db.exec(`CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );`, (err8) => {
        if (err8) console.error('Failed to create refresh_tokens table', err8);
      });

      // Ensure tasks table has cooldown_seconds column (migration for existing DBs)
      db.all("PRAGMA table_info('tasks')", (err10, taskCols) => {
        if (err10) return console.error('Failed to read tasks table info', err10);
        const hasCooldown = taskCols && taskCols.some((c) => c.name === 'cooldown_seconds');
        if (!hasCooldown) {
          db.exec('ALTER TABLE tasks ADD COLUMN cooldown_seconds INTEGER DEFAULT NULL', (err11) => {
            if (err11) console.error('Migration failed for tasks.cooldown_seconds', err11);
            else console.log('Migration: added tasks.cooldown_seconds');
          });
        }
      });

      // Ensure pin_audit table exists for PIN change/set auditing
      db.exec(`CREATE TABLE IF NOT EXISTS pin_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        performed_by INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );`, (err9) => {
        if (err9) console.error('Failed to create pin_audit table', err9);
      });

      // Ensure advance_requests has reason column (migration for existing DBs)
      db.all("PRAGMA table_info('advance_requests')", (err12, advCols) => {
        if (err12) return console.error('Failed to read advance_requests table info', err12);
        const hasReason = advCols && advCols.some((c) => c.name === 'reason');
        if (!hasReason) {
          db.exec('ALTER TABLE advance_requests ADD COLUMN reason TEXT', (err13) => {
            if (err13) console.error('Migration failed for advance_requests.reason', err13);
            else console.log('Migration: added advance_requests.reason');
          });
        }
      });
    });
  });
}

module.exports = db;

module.exports = db;
