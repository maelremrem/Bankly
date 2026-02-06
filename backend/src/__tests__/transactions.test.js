const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

// Helper to run db.run as Promise
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

let adminAgent;
let targetUserId;

beforeAll(async () => {
  // create admin
  const pw = await bcrypt.hash('transadminpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['transadmin']);
  await runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
    'transadmin',
    pw,
    'admin',
    0,
  ]);

  // create target user
  const pw2 = await bcrypt.hash('targetpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['targetuser']);
  const result = await runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
    'targetuser',
    pw2,
    'user',
    5.0,
  ]);
  // lastID isn't returned reliably by sqlite3 run wrapper in some cases; fetch user to get id
  const user = await getAsync('SELECT id FROM users WHERE username = ?', ['targetuser']);
  targetUserId = user.id;

  // login admin using agent to store cookie
  const app = require('../index');
  adminAgent = request.agent(app);
  const login = await adminAgent.post('/auth/login').send({ username: 'transadmin', password: 'transadminpass' });
  expect(login.statusCode).toBe(200);
});

describe('Transactions API', () => {
  test('POST /api/transactions adjusts user balance and creates transaction', async () => {
    const app = require('../index');
    const res = await adminAgent
      .post('/api/transactions')
      .send({ userId: targetUserId, amount: 10.5, type: 'manual', description: 'Test credit' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('transactionId');
    expect(res.body.data).toHaveProperty('balance');
    expect(Number(res.body.data.balance)).toBeCloseTo(15.5);

    // verify transaction in DB
    const tx = await getAsync('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 1', [targetUserId]);
    expect(tx).toBeDefined();
    expect(Number(tx.amount)).toBeCloseTo(10.5);
    expect(tx.description).toBe('Test credit');
  });

  test('POST /api/transactions allows negative adjustments', async () => {
    const app = require('../index');
    const res = await adminAgent
      .post('/api/transactions')
      .send({ userId: targetUserId, amount: -3.5, type: 'manual', description: 'Test debit' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.balance)).toBeCloseTo(12.0);

    const tx = await getAsync('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 1', [targetUserId]);
    expect(Number(tx.amount)).toBeCloseTo(-3.5);
    expect(tx.description).toBe('Test debit');
  });

  test('POST /api/transactions rejects if insufficient funds', async () => {
    const app = require('../index');
    // Attempt to debit more than current balance (current is 12 from previous tests)
    const res = await adminAgent
      .post('/api/transactions')
      .send({ userId: targetUserId, amount: -20.0, type: 'manual', description: 'Overdraft attempt' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Insufficient funds');

    // Ensure balance unchanged
    const u = await getAsync('SELECT balance FROM users WHERE id = ?', [targetUserId]);
    expect(Number(u.balance)).toBeCloseTo(12.0);
  });

  test('GET /api/transactions returns all transactions for admin', async () => {
    const app = require('../index');
    const res = await adminAgent
      .get('/api/transactions');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('transactions');
    expect(res.body.data).toHaveProperty('meta');
    expect(Array.isArray(res.body.data.transactions)).toBe(true);
    expect(res.body.data.transactions.length).toBeGreaterThan(0);

    // Check that transactions include user info
    const tx = res.body.data.transactions[0];
    expect(tx).toHaveProperty('username');
    expect(tx).toHaveProperty('role');
    expect(tx).toHaveProperty('user_id');
    expect(tx).toHaveProperty('type');
    expect(tx).toHaveProperty('amount');
  });

  test('GET /api/transactions supports filtering by userId', async () => {
    const app = require('../index');
    const res = await adminAgent
      .get(`/api/transactions?userId=${targetUserId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transactions.length).toBeGreaterThan(0);

    // All transactions should be for the target user
    res.body.data.transactions.forEach(tx => {
      expect(tx.user_id).toBe(targetUserId);
    });
  });

  test('GET /api/transactions supports pagination', async () => {
    const app = require('../index');
    const res = await adminAgent
      .get('/api/transactions?page=1&limit=2');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transactions.length).toBeLessThanOrEqual(2);
    expect(res.body.data.meta.page).toBe(1);
    expect(res.body.data.meta.limit).toBe(2);
    expect(res.body.data.meta).toHaveProperty('total');
    expect(res.body.data.meta).toHaveProperty('totalPages');
  });
});
