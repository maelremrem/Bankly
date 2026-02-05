const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

let adminToken;
let testUserId;

beforeAll(async () => {
  // Create admin user
  const pw = await bcrypt.hash('allowadminpass', 10);
  await db.runAsync('DELETE FROM users WHERE username = ?', ['allowadmin']);
  await db.runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
    'allowadmin',
    pw,
    'admin',
    0,
  ]);

  // Create test user
  const pw2 = await bcrypt.hash('allowuserpass', 10);
  await db.runAsync('DELETE FROM users WHERE username = ?', ['allowuser']);
  const result = await db.runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
    'allowuser',
    pw2,
    'user',
    0,
  ]);
  const user = await db.getAsync('SELECT id FROM users WHERE username = ?', ['allowuser']);
  testUserId = user.id;

  // Login admin
  const app = require('../index');
  const login = await request(app).post('/auth/login').send({ username: 'allowadmin', password: 'allowadminpass' });
  adminToken = login.body.data.token;
});

describe('Allowances API', () => {
  test('POST /api/allowances creates allowance', async () => {
    const app = require('../index');
    const res = await request(app)
      .post('/api/allowances')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: testUserId,
        amount: 10.00,
        frequency: 'weekly'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe(10.00);
    expect(res.body.data.frequency).toBe('weekly');
    expect(res.body.data.enabled).toBe(1);
    expect(res.body.data.next_payment_date).toBeDefined();
  });

  test('GET /api/allowances returns all allowances', async () => {
    const app = require('../index');
    const res = await request(app)
      .get('/api/allowances')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const allowance = res.body.data[0];
    expect(allowance).toHaveProperty('username');
    expect(allowance).toHaveProperty('amount');
    expect(allowance).toHaveProperty('frequency');
  });

  test('GET /api/allowances/:userId returns user allowances', async () => {
    const app = require('../index');
    const res = await request(app)
      .get(`/api/allowances/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    res.body.data.forEach(allowance => {
      expect(allowance.user_id).toBe(testUserId);
    });
  });

  test('PUT /api/allowances/:id updates allowance', async () => {
    // First get an allowance ID
    const allowances = await db.allAsync('SELECT id FROM allowances WHERE user_id = ?', [testUserId]);
    const allowanceId = allowances[0].id;

    const app = require('../index');
    const res = await request(app)
      .put(`/api/allowances/${allowanceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 15.00,
        frequency: 'monthly'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe(15.00);
    expect(res.body.data.frequency).toBe('monthly');
  });

  test('DELETE /api/allowances/:id deletes allowance', async () => {
    // First get an allowance ID
    const allowances = await db.allAsync('SELECT id FROM allowances WHERE user_id = ?', [testUserId]);
    const allowanceId = allowances[0].id;

    const app = require('../index');
    const res = await request(app)
      .delete(`/api/allowances/${allowanceId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it's deleted
    const deleted = await db.getAsync('SELECT * FROM allowances WHERE id = ?', [allowanceId]);
    expect(deleted).toBeUndefined();
  });

  test('POST /api/allowances validates input', async () => {
    const app = require('../index');
    const res = await request(app)
      .post('/api/allowances')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: 'invalid',
        amount: -5,
        frequency: 'invalid'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation failed');
  });

  test('POST /api/allowances rejects non-existent user', async () => {
    const app = require('../index');
    const res = await request(app)
      .post('/api/allowances')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: 99999,
        amount: 10.00,
        frequency: 'weekly'
      });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('User not found');
  });
});