const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

// Ensure admin/user exists for auth tests
beforeAll(async () => {
  const pw = await bcrypt.hash('testpass', 10);
  const pin = await bcrypt.hash('1234', 10);
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE username = ?', ['testuser'], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
  await new Promise((resolve, reject) => {
    db.run('INSERT INTO users (username, password_hash, role, rfid_card_id, pin_hash) VALUES (?, ?, ?, ?, ?)', ['testuser', pw, 'user', '123456789', pin], function (err) {
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

  test('POST /auth/rfid-login returns token with valid card_uid and pin', async () => {
    const app = require('../index');
    const res = await request(app).post('/auth/rfid-login').send({ card_uid: '123456789', pin: '1234' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('token');
  });

  test('POST /auth/rfid-login fails with invalid pin', async () => {
    const app = require('../index');
    const res = await request(app).post('/auth/rfid-login').send({ card_uid: '123456789', pin: '9999' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('success', false);
  });
});
