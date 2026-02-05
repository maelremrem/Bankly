const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

// Ensure admin/user exists for auth tests
beforeAll(async () => {
  const pw = await bcrypt.hash('testpass', 10);
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE username = ?', ['testuser'], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
  await new Promise((resolve, reject) => {
    db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['testuser', pw, 'user'], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
});

describe('Auth', () => {
  test('POST /auth/login returns token with valid credentials', async () => {
    const app = require('../index');
    const res = await request(app).post('/auth/login').send({ username: 'testuser', password: 'testpass' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('token');
  });
});
