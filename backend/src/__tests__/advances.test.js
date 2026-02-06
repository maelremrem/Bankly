const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

beforeAll(async () => {
  // Use default database like other tests
  app = require('../index');

  // Create admin user
  await db.runAsync('DELETE FROM users');
  await db.runAsync('DELETE FROM advance_requests');
  await db.runAsync('DELETE FROM transactions');
  await db.runAsync('DELETE FROM allowances');

  const adminPw = await bcrypt.hash('advadminpass', 10);
  const userPw = await bcrypt.hash('advuserpass', 10);

  const adminResult = await db.runAsync('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [
    'advtestadmin',
    adminPw,
    'admin',
  ]);
  adminUserId = adminResult.lastID;

  const userResult = await db.runAsync('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [
    'advtestuser',
    userPw,
    'user',
  ]);
  testUserId = userResult.lastID;

  // Create allowance for test user
  await db.runAsync(
    "INSERT INTO allowances (user_id, amount, frequency, next_payment_date, enabled) VALUES (?, 10, 'weekly', datetime('now', '+7 days'), 1)",
    [testUserId]
  );

  // Login users
  const adminLogin = await request(app)
    .post('/auth/login')
    .send({ username: 'advtestadmin', password: 'advadminpass' });
  adminToken = adminLogin.body.data.token;

  const userLogin = await request(app)
    .post('/auth/login')
    .send({ username: 'advtestuser', password: 'advuserpass' });
  userToken = userLogin.body.data.token;
});

afterAll(async () => {
  // Clean up
  await db.runAsync('DELETE FROM users WHERE username IN (?, ?)', ['advtestadmin', 'advtestuser']);
  await db.runAsync('DELETE FROM advance_requests');
  await db.runAsync('DELETE FROM transactions');
  await db.runAsync('DELETE FROM allowances');
});

describe('Advance Request API', () => {

  beforeEach(async () => {
    // Clean up any advance requests created by previous tests
    await db.runAsync('DELETE FROM advance_requests WHERE user_id IN (?, ?)', [testUserId, adminUserId]);
    // Also clean up any transactions created during tests
    await db.runAsync('DELETE FROM transactions WHERE user_id IN (?, ?) AND type = ?', [testUserId, adminUserId, 'advance']);
  });

  afterEach(async () => {
    // Clean up any advance requests created during tests
    await db.runAsync('DELETE FROM advance_requests WHERE user_id IN (?, ?)', [testUserId, adminUserId]);
  });

  describe('POST /api/advances', () => {
    it('should create an advance request successfully', async () => {
      const response = await request(app)
        .post('/api/advances')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-skip-validation', 'true')
        .send({ amount: 5 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.amount).toBe(5);
      expect(response.body.data.status).toBe('pending');
    });

    it('should reject advance request if user already has pending request', async () => {
      // Use the global test user and ensure clean state
      await db.runAsync('DELETE FROM advance_requests WHERE user_id = ?', [testUserId]);

      // Create first advance request
      await request(app)
        .post('/api/advances')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-skip-validation', 'true')
        .send({ amount: 3 });

      // Enable validation for this test
      process.env.TEST_VALIDATION = 'true';

      // Try to create second advance request - should fail
      const response = await request(app)
        .post('/api/advances')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ amount: 3 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already has a pending advance request');

      // Reset validation setting
      delete process.env.TEST_VALIDATION;

      // Clean up
      await db.runAsync('DELETE FROM advance_requests WHERE user_id = ?', [testUserId]);
    });

    it('should reject advance request exceeding allowance amount', async () => {
      // Enable validation for this test
      process.env.TEST_VALIDATION = 'true';

      const response = await request(app)
        .post('/api/advances')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-skip-validation', 'pending') // Skip pending request validation
        .send({ amount: 15 }); // More than allowance of 10

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('cannot exceed regular allowance amount');

      // Reset validation setting
      delete process.env.TEST_VALIDATION;
    });

    it('should reject advance request without allowance', async () => {
      // Remove allowance from test user temporarily
      await db.runAsync('DELETE FROM allowances WHERE user_id = ?', [testUserId]);

      // Enable validation for this test
      process.env.TEST_VALIDATION = 'true';

      const response = await request(app)
        .post('/api/advances')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-skip-validation', 'pending') // Skip pending request validation
        .send({ amount: 5 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('must have an allowance configured');

      // Reset validation setting
      delete process.env.TEST_VALIDATION;
    });

    it('should reject advance request when user already has pending request', async () => {
      // Create a pending advance request
      await db.runAsync(
        "INSERT INTO advance_requests (user_id, amount, status, requested_at) VALUES (?, 5, 'pending', datetime('now'))",
        [testUserId]
      );

      // Enable validation for this test
      process.env.TEST_VALIDATION = 'true';

      const response = await request(app)
        .post('/api/advances')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ amount: 5 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already has a pending advance request');

      // Reset validation setting
      delete process.env.TEST_VALIDATION;
    });
  });

  describe('GET /api/advances', () => {
    it('should return all advance requests for admin', async () => {
      const response = await request(app)
        .get('/api/advances')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/advances?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.every(req => req.status === 'pending')).toBe(true);
    });

    it('should reject non-admin access', async () => {
      const response = await request(app)
        .get('/api/advances')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/advances/user/:userId', () => {
    it('should return user advance requests for admin', async () => {
      const response = await request(app)
        .get(`/api/advances/user/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return own advance requests for user', async () => {
      const response = await request(app)
        .get(`/api/advances/user/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject user accessing other user requests', async () => {
      const response = await request(app)
        .get(`/api/advances/user/${adminUserId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/advances/:id/approve', () => {

    it('should approve advance request and create transaction', async () => {
      // Create allowance for test user
      await db.runAsync(
        "INSERT INTO allowances (user_id, amount, frequency, next_payment_date, enabled) VALUES (?, 10, 'weekly', datetime('now', '+7 days'), 1)",
        [testUserId]
      );

      // Create a fresh advance request for this test
      await db.runAsync('DELETE FROM advance_requests WHERE user_id = ?', [testUserId]);
      const advanceResult = await db.runAsync(
        "INSERT INTO advance_requests (user_id, amount, status) VALUES (?, 5, 'pending')",
        [testUserId]
      );
      const advanceId = advanceResult.lastID;

      // Verify the advance request was created
      const createdAdvance = await db.getAsync('SELECT * FROM advance_requests WHERE id = ?', [advanceId]);
      expect(createdAdvance).toBeTruthy();
      expect(createdAdvance.status).toBe('pending');

      const initialBalance = (await db.getAsync('SELECT balance FROM users WHERE id = ?', [testUserId])).balance;

      const response = await request(app)
        .post(`/api/advances/${advanceId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transactionId');

      // Check balance was updated
      const newBalance = (await db.getAsync('SELECT balance FROM users WHERE id = ?', [testUserId])).balance;
      expect(newBalance).toBe(initialBalance + 5);

      // Check allowance was adjusted
      const allowance = await db.getAsync('SELECT amount FROM allowances WHERE user_id = ?', [testUserId]);
      expect(allowance).toBeTruthy();
      expect(allowance.amount).toBe(5); // 10 - 5 = 5
    });

    it('should reject approval of non-pending request', async () => {
      // Create an approved advance request
      const approvedAdvanceResult = await db.runAsync(
        "INSERT INTO advance_requests (user_id, amount, status) VALUES (?, 3, 'approved')",
        [testUserId]
      );
      const approvedAdvanceId = approvedAdvanceResult.lastID;

      const response = await request(app)
        .post(`/api/advances/${approvedAdvanceId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('not pending');
    });

    it('should reject non-admin approval', async () => {
      // Create another pending request
      const newAdvanceResult = await db.runAsync(
        "INSERT INTO advance_requests (user_id, amount, status) VALUES (?, 3, 'pending')",
        [testUserId]
      );
      const newAdvanceId = newAdvanceResult.lastID;

      const response = await request(app)
        .post(`/api/advances/${newAdvanceId}/approve`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);

      // Clean up
      await db.runAsync('DELETE FROM advance_requests WHERE id = ?', [newAdvanceId]);
    });
  });

  describe('POST /api/advances/:id/reject', () => {

    it('should reject advance request', async () => {
      // Create a fresh advance request for this test
      const advanceResult = await db.runAsync(
        "INSERT INTO advance_requests (user_id, amount, status) VALUES (?, 3, 'pending')",
        [testUserId]
      );
      const advanceId = advanceResult.lastID;

      const response = await request(app)
        .post(`/api/advances/${advanceId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test rejection' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('rejected');
    });

    it('should reject non-admin rejection', async () => {
      // Create another pending request
      const newAdvanceResult = await db.runAsync(
        "INSERT INTO advance_requests (user_id, amount, status) VALUES (?, 2, 'pending')",
        [testUserId]
      );
      const newAdvanceId = newAdvanceResult.lastID;

      const response = await request(app)
        .post(`/api/advances/${newAdvanceId}/reject`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);

      // Clean up
      await db.runAsync('DELETE FROM advance_requests WHERE id = ?', [newAdvanceId]);
    });

    it('user can cancel own pending advance', async () => {
      const resCreate = await request(app)
        .post('/api/advances')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-skip-validation', 'true')
        .send({ amount: 2 });

      expect(resCreate.status).toBe(201);
      const advId = resCreate.body.data.id;

      const resCancel = await request(app)
        .post(`/api/advances/${advId}/cancel`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(resCancel.status).toBe(200);
      expect(resCancel.body.success).toBe(true);
      expect(resCancel.body.data.status).toBe('cancelled');
    });
  });

  describe('GET /api/advances/:id', () => {

    it('should return advance request for admin', async () => {
      // Create a fresh advance request for this test
      const advanceResult = await db.runAsync(
        "INSERT INTO advance_requests (user_id, amount, status) VALUES (?, 4, 'pending')",
        [testUserId]
      );
      const advanceId = advanceResult.lastID;

      const response = await request(app)
        .get(`/api/advances/${advanceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(advanceId);
    });

    it('should return own advance request for user', async () => {
      // Create a fresh advance request for this test
      const advanceResult = await db.runAsync(
        "INSERT INTO advance_requests (user_id, amount, status) VALUES (?, 4, 'pending')",
        [testUserId]
      );
      const advanceId = advanceResult.lastID;

      const response = await request(app)
        .get(`/api/advances/${advanceId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject user accessing other user request', async () => {
      // Create advance for admin user
      const adminAdvanceResult = await db.runAsync(
        "INSERT INTO advance_requests (user_id, amount, status) VALUES (?, 1, 'pending')",
        [adminUserId]
      );
      const adminAdvanceId = adminAdvanceResult.lastID;

      const response = await request(app)
        .get(`/api/advances/${adminAdvanceId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);

      // Clean up
      await db.runAsync('DELETE FROM advance_requests WHERE id = ?', [adminAdvanceId]);
    });

    it('should return 404 for non-existent advance', async () => {
      const response = await request(app)
        .get('/api/advances/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });
});
