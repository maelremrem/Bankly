const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

// Ensure admin/user exists for auth tests
beforeAll(async () => {
  const pw = await bcrypt.hash('testpass', 10);
  const pin = await bcrypt.hash('1234', 10);
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE username = ?', ['testuser'], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
  await new Promise((resolve, reject) => {
    db.run('INSERT INTO users (username, password_hash, role, rfid_card_id, pin_hash) VALUES (?, ?, ?, ?, ?)', ['testuser', pw, 'user', '123456789', pin], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
});

describe('Auth', () => {
  test('POST /auth/login returns token with valid credentials', async () => {
    const app = require('../index');
    const res = await request(app).post('/auth/login').send({ username: 'testuser', password: 'testpass' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('token');
  });

  test('POST /auth/rfid-login returns token with valid card_uid and pin', async () => {
    const app = require('../index');
    const res = await request(app).post('/auth/rfid-login').send({ card_uid: '123456789', pin: '1234' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('token');
  });

  test('POST /auth/rfid-login fails with invalid pin', async () => {
    const app = require('../index');
    const res = await request(app).post('/auth/rfid-login').send({ card_uid: '123456789', pin: '9999' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('success', false);
  });

  test('POST /auth/pin-login sets pin on first use and returns token', async () => {
    const app = require('../index');
    // create a new user without a pin
    const pw = await bcrypt.hash('pinnewpass', 10);
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM users WHERE username = ?', ['pinnewuser'], function (err) {
        if (err) return reject(err);
        resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', ['pinnewuser', pw, 'user', 0], function (err) {
        if (err) return reject(err);
        resolve();
      });
    });

    // first time pin-login should set the PIN and return token
    const res = await request(app).post('/auth/pin-login').send({ username: 'pinnewuser', pin: '1234' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.pinCreated).toBe(true);

    // verify PIN stored
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT pin_hash FROM users WHERE username = ?', ['pinnewuser'], (err, r) => {
        if (err) return reject(err);
        resolve(r);
      });
    });
    expect(row.pin_hash).toBeDefined();
    const match = await bcrypt.compare('1234', row.pin_hash);
    expect(match).toBe(true);
  });

  test('POST /auth/refresh rotates refresh token and returns new access token', async () => {
    const app = require('../index');
    const agent = request.agent(app);
    // login to set cookies
    const login = await agent.post('/auth/login').send({ username: 'testuser', password: 'testpass' });
    expect(login.status).toBe(200);

    const res = await agent.post('/auth/refresh').send();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
  });

  test('POST /auth/change-pin allows user to set or change PIN', async () => {
    const app = require('../index');

    // create a user without PIN
    const pw = await bcrypt.hash('changepinuserpass', 10);
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM users WHERE username = ?', ['changepinuser'], function (err) { if (err) return reject(err); resolve(); });
    });
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['changepinuser', pw, 'user'], function (err) { if (err) return reject(err); resolve(); });
    });

    // login as that user with password to get token
    const login = await request(app).post('/auth/login').send({ username: 'changepinuser', password: 'changepinuserpass' });
    expect(login.statusCode).toBe(200);
    const token = login.body.data.token;

    // change PIN (first-time, oldPin not required)
    const res = await request(app).post('/auth/change-pin').set('Authorization', `Bearer ${token}`).send({ newPin: '2222' });
    expect(res.statusCode).toBe(200);

    // verify audit entry exists for created PIN
    const audit = await db.getAsync('SELECT * FROM pin_audit WHERE user_id = (SELECT id FROM users WHERE username = ?) AND action = ?', ['changepinuser', 'created']);
    expect(audit).toBeDefined();

    // Now login with PIN
    const pinLogin = await request(app).post('/auth/pin-login').send({ username: 'changepinuser', pin: '2222' });
    expect(pinLogin.statusCode).toBe(200);

    // Now change PIN requiring oldPin
    const userToken = pinLogin.body.data.token;
    const changeAgain = await request(app).post('/auth/change-pin').set('Authorization', `Bearer ${userToken}`).send({ oldPin: '2222', newPin: '3333' });
    expect(changeAgain.statusCode).toBe(200);

    // Ensure old PIN no longer works
    const oldPinLogin = await request(app).post('/auth/pin-login').send({ username: 'changepinuser', pin: '2222' });
    expect(oldPinLogin.statusCode).toBe(401);

    // New PIN works
    const newPinLogin = await request(app).post('/auth/pin-login').send({ username: 'changepinuser', pin: '3333' });
    expect(newPinLogin.statusCode).toBe(200);
  });

  test('POST /auth/logout revokes refresh token', async () => {
    const app = require('../index');
    const agent = request.agent(app);
    const login = await agent.post('/auth/login').send({ username: 'testuser', password: 'testpass' });
    expect(login.status).toBe(200);

    const out = await agent.post('/auth/logout').send();
    expect(out.statusCode).toBe(200);
    expect(out.body.success).toBe(true);

    // subsequent refresh should fail
    const res = await agent.post('/auth/refresh').send();
    expect(res.statusCode).toBe(401);
  });

  test('Admin can list and revoke refresh tokens', async () => {
    const app = require('../index');

    // Helpers
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

    // create admin
    const apw = await bcrypt.hash('admintokenpass', 10);
    await runAsync('DELETE FROM users WHERE username = ?', ['tokenadmin']);
    await runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
      'tokenadmin', apw, 'admin', 0
    ]);

    // create test user
    const upw = await bcrypt.hash('tokuserpass', 10);
    await runAsync('DELETE FROM users WHERE username = ?', ['tokuser']);
    await runAsync('INSERT INTO users (username, password_hash, role, balance) VALUES (?, ?, ?, ?)', [
      'tokuser', upw, 'user', 0
    ]);

    const adminAgent = request.agent(app);
    const loginAdmin = await adminAgent.post('/auth/login').send({ username: 'tokenadmin', password: 'admintokenpass' });
    expect(loginAdmin.status).toBe(200);

    const userAgent = request.agent(app);
    const loginUser = await userAgent.post('/auth/login').send({ username: 'tokuser', password: 'tokuserpass' });
    expect(loginUser.status).toBe(200);

    const user = await getAsync('SELECT id FROM users WHERE username = ?', ['tokuser']);

    // admin lists refresh tokens for user
    const list = await adminAgent.get(`/api/admin/refresh-tokens?userId=${user.id}`);
    expect(list.statusCode).toBe(200);
    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.length).toBeGreaterThan(0);

    const tokenId = list.body.data[0].id;

    // revoke the token
    const revoke = await adminAgent.post(`/api/admin/refresh-tokens/${tokenId}/revoke`).send();
    expect(revoke.statusCode).toBe(200);
    expect(revoke.body.success).toBe(true);
    expect(revoke.body.data.deleted).toBeGreaterThanOrEqual(1);

    // user refresh should now fail
    const refreshRes = await userAgent.post('/auth/refresh').send();
    expect(refreshRes.statusCode).toBe(401);
  });
});
