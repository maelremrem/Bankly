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
let privilegedToken;
let userId;
let origTxId;

beforeAll(async () => {
  // create admin with can_reverse
  const pw = await bcrypt.hash('undoadminpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['undoadmin']);
  await runAsync('INSERT INTO users (username, password_hash, role, balance, can_reverse) VALUES (?, ?, ?, ?, ?)', [
    'undoadmin',
    pw,
    'admin',
    0,
    1,
  ]);

  // create privileged user who can reverse (non-admin)
  const pwPriv = await bcrypt.hash('privpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['privuser']);
  await runAsync('INSERT INTO users (username, password_hash, role, balance, can_reverse) VALUES (?, ?, ?, ?, ?)', [
    'privuser',
    pwPriv,
    'user',
    0,
    1,
  ]);

  // create normal user
  const pw2 = await bcrypt.hash('undouserpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['undouser']);
  await runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
    'undouser',
    pw2,
    'user',
    0,
  ]);

  const user = await getAsync('SELECT id FROM users WHERE username = ?', ['undouser']);
  userId = user.id;

  const app = require('../index');
  const login = await request(app).post('/auth/login').send({ username: 'undoadmin', password: 'undoadminpass' });
  adminToken = login.body.data.token;

  const loginPriv = await request(app).post('/auth/login').send({ username: 'privuser', password: 'privpass' });
  privilegedToken = loginPriv.body.data.token;

  // create a transaction to reverse
  const txRes = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userId, amount: 50.0, type: 'manual', description: 'Funding to reverse' });

  origTxId = txRes.body.data.transactionId;

  // reverse the transaction (admin)
  await request(app).post(`/api/transactions/${origTxId}/reverse`).set('Authorization', `Bearer ${adminToken}`).send();
});

describe('Undo reversal (reversible undo)', () => {
  test('Privileged non-admin user with can_reverse can undo a reversal', async () => {
    const app = require('../index');
    // get the reversal record
    const rev = await getAsync('SELECT * FROM transaction_reversals WHERE original_transaction_id = ?', [origTxId]);
    expect(rev).toBeDefined();
    expect(rev.reverted).toBe(0);

    const res = await request(app)
      .post(`/api/transactions/reversals/${origTxId}/undo`)
      .set('Authorization', `Bearer ${privilegedToken}`)
      .send();

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.balance)).toBeCloseTo(50.0);

    // ensure reversal record marked reverted
    const revAfter = await getAsync('SELECT * FROM transaction_reversals WHERE original_transaction_id = ?', [origTxId]);
    expect(revAfter.reverted).toBe(1);
    expect(revAfter.reverted_by).toBeDefined();
  });

  test('Cannot undo twice', async () => {
    const app = require('../index');
    const res = await request(app)
      .post(`/api/transactions/reversals/${origTxId}/undo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.statusCode).toBe(404);
  });

  test('Forbidden for user without permission', async () => {
    const app = require('../index');
    // create a new transaction and reverse it
    const tx = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId, amount: 10.0, type: 'manual', description: 'Second funding' });
    const txId = tx.body.data.transactionId;
    await request(app).post(`/api/transactions/${txId}/reverse`).set('Authorization', `Bearer ${adminToken}`).send();

    // login as normal user without can_reverse
    const login = await request(app).post('/auth/login').send({ username: 'undouser', password: 'undouserpass' });
    const token = login.body.data.token;

    const res = await request(app).post(`/api/transactions/reversals/${txId}/undo`).set('Authorization', `Bearer ${token}`).send();
    expect(res.statusCode).toBe(403);
  });
});
