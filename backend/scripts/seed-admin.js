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

  // Create a test user with PIN
  const userPassword = await bcrypt.hash('user123', 10);
  const userPin = await bcrypt.hash('1234', 10);
  db.get('SELECT id FROM users WHERE username = ?', ['testuser'], (err, row) => {
    if (err) return console.error('Failed to check test user', err);
    if (row) return console.log('Test user already exists');

    db.run(
      'INSERT INTO users (username, password_hash, pin_hash, role, balance) VALUES (?, ?, ?, ?, ?)',
      ['testuser', userPassword, userPin, 'user', 10.0],
      function (err2) {
        if (err2) return console.error('Failed to create test user', err2);
        console.log('Test user created with id', this.lastID);
      }
    );
  });

  // Create another test user
  const user2Password = await bcrypt.hash('user456', 10);
  const user2Pin = await bcrypt.hash('5678', 10);
  db.get('SELECT id FROM users WHERE username = ?', ['alice'], (err, row) => {
    if (err) return console.error('Failed to check alice', err);
    if (row) return console.log('Alice already exists');

    db.run(
      'INSERT INTO users (username, password_hash, pin_hash, role, balance) VALUES (?, ?, ?, ?, ?)',
      ['alice', user2Password, user2Pin, 'user', 5.0],
      function (err2) {
        if (err2) return console.error('Failed to create alice', err2);
        console.log('Alice created with id', this.lastID);
      }
    );
  });
}

seed();
