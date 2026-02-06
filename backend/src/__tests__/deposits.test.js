const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../index');
const db = require('../config/database');

describe('Deposits API', () => {
  let userToken, userId, adminToken;

  beforeAll(async () => {
    // ensure clean
    await db.runAsync('DELETE FROM users');
    await db.runAsync('DELETE FROM deposit_requests');

    const adminPw = await bcrypt.hash('adminpass', 10);
    const userPw = await bcrypt.hash('testpass', 10);

    await db.runAsync(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')`, ['depadmin', adminPw]);
    await db.runAsync(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')`, ['depuser', userPw]);

    const adminLogin = await request(app).post('/auth/login').send({ username: 'depadmin', password: 'adminpass' });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.token;

    const user = await db.getAsync('SELECT * FROM users WHERE username = ?', ['depuser']);
    userId = user.id;

    const userLogin = await request(app).post('/auth/login').send({ username: 'depuser', password: 'testpass' });
    expect(userLogin.status).toBe(200);
    userToken = userLogin.body.data.token;
  });

  test('POST /api/deposits - submit deposit request', async () => {
    const res = await request(app)
      .post('/api/deposits')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: 10.50, reference: 'Bank tx 123' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe(10.5);
    expect(res.body.data.status).toBe('pending');
  });

  test('GET /api/deposits/user/:userId - list user deposits', async () => {
    const res = await request(app)
      .get(`/api/deposits/user/${userId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('amount');
  });

  test('User can cancel own pending deposit', async () => {
    // create a deposit
    const create = await request(app).post('/api/deposits').set('Authorization', `Bearer ${userToken}`).send({ amount: 5.00, reference: 'tx123' });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const cancel = await request(app).post(`/api/deposits/${id}/cancel`).set('Authorization', `Bearer ${userToken}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.success).toBe(true);
    expect(cancel.body.data.status).toBe('cancelled');
  });

  test('Admin can approve deposit and credit balance', async () => {
    // create deposit as user
    const create = await request(app).post('/api/deposits').set('Authorization', `Bearer ${userToken}`).send({ amount: 10.00, reference: 'tx456' });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const approve = await request(app).post(`/api/deposits/${id}/approve`).set('Authorization', `Bearer ${adminToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.success).toBe(true);

    const user = await db.getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    expect(user.balance).toBeCloseTo(10.00);
  });
});