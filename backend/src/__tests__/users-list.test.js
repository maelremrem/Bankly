const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

beforeAll(async () => {
  // ensure admin exists
  const pw = await bcrypt.hash('adminlistpass', 10);
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE username = ?', ['adminlist'], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
  await new Promise((resolve, reject) => {
    db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['adminlist', pw, 'admin'], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
});

describe('Users list API', () => {
  test('GET /api/users returns paginated list for admin', async () => {
    const app = require('../index');
    // login admin
    const login = await request(app).post('/auth/login').send({ username: 'adminlist', password: 'adminlistpass' });
    expect(login.statusCode).toBe(200);
    const token = login.body.data.token;

    // create several users
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: `listuser${i}`, password: `pass${i}123` });
    }

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 2, limit: 2 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('users');
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.users.length).toBe(2);
    expect(res.body.data).toHaveProperty('meta');
    expect(res.body.data.meta.page).toBe(2);

    // cleanup
    for (let i = 1; i <= 5; i++) {
      db.run('DELETE FROM users WHERE username = ?', [`listuser${i}`]);
    }
  });
});
