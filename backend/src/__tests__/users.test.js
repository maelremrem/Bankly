const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

beforeAll(async () => {
  // ensure admin exists
  const pw = await bcrypt.hash('adminpass', 10);
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE username = ?', ['admintest'], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
  await new Promise((resolve, reject) => {
    db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['admintest', pw, 'admin'], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
});

describe('Users API', () => {
  test('POST /api/users creates user when authenticated as admin', async () => {
    const app = require('../index');
    // login admin
    const login = await request(app).post('/auth/login').send({ username: 'admintest', password: 'adminpass' });
    expect(login.statusCode).toBe(200);
    const token = login.body.data.token;

    // create new user (no password required for regular users)
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newuser' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');

    // Admin sets a PIN for the user
    const userId = res.body.data.id;
    const pinSet = await request(app)
      .put(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '1234' });

    expect(pinSet.statusCode).toBe(200);
    expect(pinSet.body.success).toBe(true);

    // verify audit entry exists for admin_set
    const audit = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM pin_audit WHERE user_id = ? AND action = ?', [userId, 'admin_set'], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    expect(audit).toBeDefined();

    // User can login with PIN
    const pinLogin = await request(app).post('/auth/pin-login').send({ username: 'newuser', pin: '1234' });
    expect(pinLogin.statusCode).toBe(200);

    // Update user: change username and password (make user an admin now)
    const update = await request(app)
      .put(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'updateduser', password: 'updatedPass1', role: 'admin' });

    expect(update.statusCode).toBe(200);
    expect(update.body.success).toBe(true);
    expect(update.body.data.username).toBe('updateduser');

    // Login with new credentials
    const loginNew = await request(app).post('/auth/login').send({ username: 'updateduser', password: 'updatedPass1' });
    expect(loginNew.statusCode).toBe(200);

    // Delete user
    const del = await request(app)
      .delete(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(del.statusCode).toBe(200);
    expect(del.body.success).toBe(true);

    // Ensure login no longer works
    const loginAfterDel = await request(app).post('/auth/login').send({ username: 'updateduser', password: 'updatedPass1' });
    expect(loginAfterDel.statusCode).toBe(401);

    // cleanup admin
    db.run('DELETE FROM users WHERE username = ?', ['admintest']);
  });
});
