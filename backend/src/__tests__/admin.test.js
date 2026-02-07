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

  test('GET /api/admin/overview excludes admin users from counts', async () => {
    // Count non-admin users directly from DB
    const row = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as cnt, COALESCE(SUM(balance),0) as sumBal FROM users WHERE role != 'admin'", [], (err, r) => err ? reject(err) : resolve(r));
    });

    const txRow = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as cnt FROM transactions t JOIN users u ON t.user_id = u.id WHERE u.role != 'admin'", [], (err, r) => err ? reject(err) : resolve(r));
    });

    const res = await adminAgent.get('/api/admin/overview');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const data = res.body.data;
    expect(data.totalUsers).toBe(row.cnt);
    expect(Number(data.totalBalance)).toBeCloseTo(Number(row.sumBal || 0));
    expect(Number(data.totalTransactions)).toBe(txRow.cnt);
  });

  test('GET /api/admin/overview pending and averages exclude admins', async () => {
    const advRow = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as cnt FROM advance_requests ar JOIN users u ON ar.user_id = u.id WHERE ar.status = 'pending' AND u.role != 'admin'", [], (err, r) => err ? reject(err) : resolve(r));
    });

    const compRow = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as cnt FROM task_completions tc JOIN users u ON tc.user_id = u.id WHERE tc.status = 'pending' AND u.role != 'admin'", [], (err, r) => err ? reject(err) : resolve(r));
    });

    const avgRow = await new Promise((resolve, reject) => {
      db.get("SELECT COALESCE(AVG(a.amount),0) as avg FROM allowances a JOIN users u ON a.user_id = u.id WHERE a.enabled = 1 AND u.role != 'admin'", [], (err, r) => err ? reject(err) : resolve(r));
    });

    const res = await adminAgent.get('/api/admin/overview');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const data = res.body.data;
    expect(data.pendingAdvances).toBe(advRow.cnt);
    expect(data.pendingCompletions).toBe(compRow.cnt);
    expect(Number(data.averageAllowance)).toBeCloseTo(Number(avgRow.avg || 0));
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

  test('GET /api/admin/overview/transactions/daily returns data', async () => {
    const res = await adminAgent.get('/api/admin/overview/transactions/daily');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/admin/overview/balances/top returns data', async () => {
    const res = await adminAgent.get('/api/admin/overview/balances/top');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/admin/overview/allowances/monthly returns data', async () => {
    const res = await adminAgent.get('/api/admin/overview/allowances/monthly');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/admin/overview/html returns cards including pending completions', async () => {
    const res = await adminAgent.get('/api/admin/overview/html');
    expect(res.statusCode).toBe(200);
    // It should include the Pending Task Reviews card heading (i18n string present in HTML)
    expect(res.text).toMatch(/pending task reviews|Tâches en attente/i);
  });

  test('GET /admin/dashboard.html is protected and requires cookie', async () => {
    // without cookie should redirect to root
    const res1 = await request(app).get('/admin/dashboard.html');
    expect(res1.statusCode).toBe(302);
    expect(res1.headers.location).toBe('/admin/login?next=%2Fadmin%2Fdashboard.html');

    // with cookie should succeed
    const agent = request.agent(app);
    // login using agent to set cookie
    const login = await agent.post('/auth/login').send({ username: 'admintest', password: 'adminpass' });
    expect(login.status).toBe(200);
    // now request the static file
    const res2 = await agent.get('/admin/dashboard.html');
    expect(res2.statusCode).toBe(200);
    expect(res2.text).toContain('<title>Admin Dashboard - Bankly');
  });
});
