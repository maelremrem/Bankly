const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const app = require('../index');

let adminAgent = null;

beforeAll(async () => {
  const pw = await bcrypt.hash('adminpass', 10);

  // ensure idempotent test setup
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE username = ?', ['admintest'], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    db.run('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', ['admintest', pw, 'admin', 100], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });

  adminAgent = request.agent(app);
  const res = await adminAgent.post('/auth/login').send({ username: 'admintest', password: 'adminpass' });
  expect(res.statusCode).toBe(200);
});

describe('Admin API', () => {
  test('GET /api/admin/overview requires auth', async () => {
    const res = await request(app).get('/api/admin/overview');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/admin/overview returns stats for admin', async () => {
    const res = await adminAgent.get('/api/admin/overview');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('totalUsers');
    expect(res.body.data).toHaveProperty('totalTransactions');
    expect(res.body.data).toHaveProperty('totalBalance');
  });

  test('GET /api/admin/users returns users array', async () => {
    const res = await adminAgent.get('/api/admin/users');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some(u => u.username === 'admintest')).toBe(true);
  });

  test('GET /api/admin/transactions returns array', async () => {
    const res = await adminAgent.get('/api/admin/transactions');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /admin/dashboard.html is protected and requires cookie', async () => {
    // without cookie should redirect to root
    const res1 = await request(app).get('/admin/dashboard.html');
    expect(res1.statusCode).toBe(302);
    expect(res1.headers.location).toBe('/login?next=%2Fadmin%2Fdashboard.html');

    // with cookie should succeed
    const agent = request.agent(app);
    // login using agent to set cookie
    const login = await agent.post('/auth/login').send({ username: 'admintest', password: 'adminpass' });
    expect(login.status).toBe(200);
    // now request the static file
    const res2 = await agent.get('/admin/dashboard.html');
    expect(res2.statusCode).toBe(200);
    expect(res2.text).toContain('<title>Admin Dashboard - Monly');
  });
});
