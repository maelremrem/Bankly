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
let userId;
let origTxId;

beforeAll(async () => {
  const pw = await bcrypt.hash('revadminpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['revadmin']);
  await runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
    'revadmin',
    pw,
    'admin',
    0,
  ]);

  const pw2 = await bcrypt.hash('revuserpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['revuser']);
  await runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
    'revuser',
    pw2,
    'user',
    0,
  ]);

  const user = await getAsync('SELECT id FROM users WHERE username = ?', ['revuser']);
  userId = user.id;

  const app = require('../index');
  const login = await request(app).post('/auth/login').send({ username: 'revadmin', password: 'revadminpass' });
  adminToken = login.body.data.token;

  // create a transaction to reverse
  const txRes = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userId, amount: 20.0, type: 'manual', description: 'Initial funding' });

  origTxId = txRes.body.data.transactionId;
});

describe('Transaction reversal', () => {
  test('Admin can reverse a transaction and balance is adjusted', async () => {
    const app = require('../index');
    // check balance before
    let u = await getAsync('SELECT balance FROM users WHERE id = ?', [userId]);
    expect(Number(u.balance)).toBeCloseTo(20.0);

    const res = await request(app)
      .post(`/api/transactions/${origTxId}/reverse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('reversalTransactionId');
    expect(Number(res.body.data.balance)).toBeCloseTo(0.0);

    // ensure reversal record exists
    const rev = await getAsync('SELECT * FROM transaction_reversals WHERE original_transaction_id = ?', [origTxId]);
    expect(rev).toBeDefined();

    // ensure reversal transaction is in transactions and amount is negative
    const revTx = await getAsync('SELECT * FROM transactions WHERE id = ?', [rev.reversal_transaction_id]);
    expect(Number(revTx.amount)).toBeCloseTo(-20.0);
    expect(revTx.type).toBe('reversal');
  });

  test('Cannot reverse same transaction twice', async () => {
    const app = require('../index');
    const res = await request(app)
      .post(`/api/transactions/${origTxId}/reverse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('Reverse fails if it would create negative balance', async () => {
    const app = require('../index');

    // Create a new original transaction of 50
    const createTx = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId, amount: 50.0, type: 'manual', description: 'Big credit' });

    expect(createTx.statusCode).toBe(201);
    const newOrigId = createTx.body.data.transactionId;

    // Debit user by 40 -> balance becomes 10
    const debit = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId, amount: -40.0, type: 'manual', description: 'Partial debit' });

    expect(debit.statusCode).toBe(201);

    // Now attempt to reverse the 50 credit -> would lead to -40 which should be blocked
    const res = await request(app)
      .post(`/api/transactions/${newOrigId}/reverse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Insufficient funds');
  });
});
