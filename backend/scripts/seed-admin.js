const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function seed() {
  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  db.get('SELECT id FROM users WHERE username = ?', [ADMIN_USERNAME], (err, row) => {
    if (err) return console.error('Failed to check admin', err);
    if (row) return console.log('Admin already exists');

    db.run(
      'INSERT INTO users (username, password_hash, role, can_reverse) VALUES (?, ?, ?, ?)',
      [ADMIN_USERNAME, password_hash, 'admin', 1],
      function (err2) {
        if (err2) return console.error('Failed to create admin', err2);
        console.log('Admin created with id', this.lastID);
      }
    );
  });
}

seed();
