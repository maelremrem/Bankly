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
  const pw = await bcrypt.hash('listrevadminpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['listrevadmin']);
  await runAsync('INSERT INTO users (username, password_hash, role, can_reverse) VALUES (?, ?, ?, ?)', ['listrevadmin', pw, 'admin', 1]);

  const pw2 = await bcrypt.hash('listrevuserpass', 10);
  await runAsync('DELETE FROM users WHERE username = ?', ['listrevuser']);
  await runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', ['listrevuser', pw2, 'user', 0]);

  const u = await getAsync('SELECT id FROM users WHERE username = ?', ['listrevuser']);
  userId = u.id;

  const app = require('../index');
  const login = await request(app).post('/auth/login').send({ username: 'listrevadmin', password: 'listrevadminpass' });
  adminToken = login.body.data.token;

  // create multiple transactions and reversals
  for (let i = 1; i <= 5; i++) {
    const txRes = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId, amount: 5 * i, type: i % 2 === 0 ? 'allowance' : 'manual', description: `tx${i}` });
    const txId = txRes.body.data.transactionId;
    // reverse some
    if (i % 2 === 0) {
      await request(app).post(`/api/transactions/${txId}/reverse`).set('Authorization', `Bearer ${adminToken}`).send();
    }
    if (i === 2) origTxId = txId; // keep one for detail test
  }
});

describe('Reversals listing and detail', () => {
  test('Admin can list reversals with pagination and filter by user', async () => {
    const app = require('../index');
    const res = await request(app)
      .get('/api/transactions/reversals')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, limit: 2, userId });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.reversals)).toBe(true);
    expect(res.body.data.reversals.length).toBeLessThanOrEqual(2);
    expect(res.body.data.meta.page).toBe(1);
  });

  test('Admin can filter reversals by reverted flag', async () => {
    const app = require('../index');
    // none were reverted yet so reverted=0 should return those
    const res = await request(app).get('/api/transactions/reversals').set('Authorization', `Bearer ${adminToken}`).query({ reverted: 0 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.reversals.every((r) => r.reverted === 0)).toBe(true);
  });

  test('Admin can get reversal details', async () => {
    const app = require('../index');
    const rev = await getAsync('SELECT * FROM transaction_reversals WHERE original_transaction_id = ?', [origTxId]);
    const res = await request(app).get(`/api/transactions/reversals/${rev.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('original');
    expect(res.body.data).toHaveProperty('reversalTx');
  });
});
