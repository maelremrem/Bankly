const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const dbFile = process.env.DATABASE_FILE || path.join(__dirname, '..', '..', 'data', 'monly.db');
const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(dbFile);

// Promisify database operations for easier use
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
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
    });
  });
}

module.exports = db;

module.exports = db;
