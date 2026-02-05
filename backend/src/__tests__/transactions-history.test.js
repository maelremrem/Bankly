const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

let adminToken;
let userToken;
let userId;

beforeAll(async () => {
  // create admin
  const pwAdmin = await bcrypt.hash('histadminpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['histadmin']);
  await runAsync('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['histadmin', pwAdmin, 'admin']);

  // create user
  const pwUser = await bcrypt.hash('histpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['histuser']);
  await runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
    'histuser',
    pwUser,
    'user',
    0,
  ]);
  const u = await getAsync('SELECT id FROM users WHERE username = ?', ['histuser']);
  userId = u.id;

  const app = require('../index');

  const loginAdmin = await request(app).post('/auth/login').send({ username: 'histadmin', password: 'histadminpass' });
  adminToken = loginAdmin.body.data.token;

  const loginUser = await request(app).post('/auth/login').send({ username: 'histuser', password: 'histpass' });
  userToken = loginUser.body.data.token;

  // create some transactions for user
  await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userId, amount: 5.0, type: 'allowance', description: 'Allowance 1' });
  await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userId, amount: 3.0, type: 'task', description: 'Task reward' });
  await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userId, amount: -1.5, type: 'manual', description: 'Manual debit' });
});

describe('Transactions history', () => {
  test('User can fetch their own transactions with pagination', async () => {
    const app = require('../index');
    const res = await request(app)
      .get(`/api/users/${userId}/transactions`)
      .set('Authorization', `Bearer ${userToken}`)
      .query({ page: 1, limit: 2 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('transactions');
    expect(Array.isArray(res.body.data.transactions)).toBe(true);
    expect(res.body.data.transactions.length).toBe(2);
    expect(res.body.data).toHaveProperty('meta');
  });

  test('Admin can fetch any user transactions and filter by type', async () => {
    const app = require('../index');
    const res = await request(app)
      .get(`/api/users/${userId}/transactions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ type: 'allowance' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transactions.every((t) => t.type === 'allowance')).toBe(true);
  });

  test('Forbidden when non-owner tries to access another user', async () => {
    // create another user
    const pw = await bcrypt.hash('otherpass', 10);
    await runAsync('DELETE FROM users WHERE username = ?', ['otheruser']);
    await runAsync('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['otheruser', pw, 'user']);
    const other = await getAsync('SELECT id FROM users WHERE username = ?', ['otheruser']);

    const app = require('../index');
    const res = await request(app)
      .get(`/api/users/${other.id}/transactions`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.statusCode).toBe(403);
  });
});
