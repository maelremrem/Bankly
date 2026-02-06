const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../index');
const db = require('../config/database');

describe('Tasks API', () => {
  let adminToken, userToken, taskId, completionId, completionTaskId;

  beforeAll(async () => {
    const app = require('../index');
    
    // Create admin user
    await db.runAsync('DELETE FROM users');
    await db.runAsync('DELETE FROM tasks');
    await db.runAsync('DELETE FROM task_completions');
    await db.runAsync('DELETE FROM transactions');

    const adminPw = await bcrypt.hash('testpass', 10);
    const userPw = await bcrypt.hash('testpass', 10);

    await db.runAsync(`
      INSERT INTO users (username, password_hash, role, can_reverse)
      VALUES (?, ?, 'admin', 1)
    `, ['taskadmin', adminPw]);
    const userInsert = await db.runAsync(`
      INSERT INTO users (username, password_hash, role, can_reverse)
      VALUES (?, ?, 'user', 0)
    `, ['taskuser', userPw]);
    console.log('userInsert', userInsert);
    
    // Check if user exists
    const user = await db.getAsync('SELECT * FROM users WHERE username = ?', ['taskuser']);
    console.log('user in db', user);

    // Get tokens
    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ username: 'taskadmin', password: 'testpass' });
    console.log('adminLogin', adminLogin.status, adminLogin.body);
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.token;

    const userLogin = await request(app)
      .post('/auth/login')
      .send({ username: 'taskuser', password: 'testpass' });
    console.log('userLogin', userLogin.status, userLogin.body);
    expect(userLogin.status).toBe(200);
    userToken = userLogin.body.data.token;

    // Create a task for testing
    const taskResponse = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Clean room',
        description: 'Clean your bedroom thoroughly',
        reward_amount: 5.00,
        requires_approval: true
      });
    taskId = taskResponse.body.data.id;

    // Create a separate task for completion tests
    const completionTaskResponse = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Clean room completion',
        description: 'Clean your bedroom thoroughly',
        reward_amount: 5.00,
        requires_approval: true
      });
    completionTaskId = completionTaskResponse.body.data.id;
  });

  describe('POST /api/tasks', () => {
    it('should create a new task (admin)', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Wash dishes',
          description: 'Wash all the dishes',
          reward_amount: 3.00,
          requires_approval: false
        });

      expect(response.status).toBe(201);
      console.log('Create task response:', response.status, response.body);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Wash dishes');
      expect(response.body.data.reward_amount).toBe(3.00);
      expect(response.body.data.requires_approval).toBe(0);
    });

    it('should reject task creation without auth', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({ name: 'Test task' });

      expect(response.status).toBe(401);
    });

    it('should reject task creation by non-admin', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Test task' });

      expect(response.status).toBe(403);
    });

    it('should validate task data', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/tasks', () => {
    it('should get all tasks (admin)', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should reject getting tasks without admin auth', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('should update a task (admin)', async () => {
      const response = await request(app)
        .put(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Clean bedroom' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Clean bedroom');
    });

    it('should reject updating non-existent task', async () => {
      const response = await request(app)
        .put('/api/tasks/999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete a task (admin)', async () => {
      const response = await request(app)
        .delete(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject deleting non-existent task', async () => {
      const response = await request(app)
        .delete('/api/tasks/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/tasks/:id/complete', () => {

    it('should submit task completion (user)', async () => {
      const response = await request(app)
        .post(`/api/tasks/${completionTaskId}/complete`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('pending');
      completionId = response.body.data.id;
    });

    it('should reject duplicate pending completion', async () => {
      const response = await request(app)
        .post(`/api/tasks/${completionTaskId}/complete`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Task completion already pending approval');
    });

    it('should reject completion of non-existent task', async () => {
      const response = await request(app)
        .post('/api/tasks/999/complete')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/tasks/:id/completions', () => {
    it('should get task completions (admin)', async () => {
      const response = await request(app)
        .get(`/api/tasks/${completionTaskId}/completions`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should reject getting completions without admin auth', async () => {
      const response = await request(app)
        .get(`/api/tasks/${taskId}/completions`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/tasks/completions/:completionId/approve', () => {
    it('should approve task completion (admin)', async () => {
      const response = await request(app)
        .post(`/api/tasks/completions/${completionId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ approved: true, review_notes: 'Good job!' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('approved');
    });

    it('should create transaction on approval', async () => {
      const transactions = await db.allAsync('SELECT * FROM transactions WHERE type = ?', ['task']);
      expect(transactions.length).toBeGreaterThan(0);
      expect(transactions[0].amount).toBe(5.00);
    });

    it('should update user balance on approval', async () => {
      const user = await db.getAsync('SELECT * FROM users WHERE username = ?', ['taskuser']);
      expect(user.balance).toBe(5.00);
    });

    it('should reject approval of non-existent completion', async () => {
      const response = await request(app)
        .post('/api/tasks/completions/999/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ approved: true });

      expect(response.status).toBe(404);
    });

    it('should reject approval without admin auth', async () => {
      const response = await request(app)
        .post(`/api/tasks/completions/${completionId}/approve`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ approved: true });

      expect(response.status).toBe(403);
    });
  });

  describe('Auto-approval tasks', () => {
    let autoTaskId;

    it('should auto-approve task completion', async () => {
      // Create auto-approval task
      const taskResponse = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Auto task',
          description: 'Auto-approved task',
          reward_amount: 2.00,
          requires_approval: false
        });
      autoTaskId = taskResponse.body.data.id;

      const response = await request(app)
        .post(`/api/tasks/${autoTaskId}/complete`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('approved');
    });

    it('should create transaction immediately for auto-approved tasks', async () => {
      const transactions = await db.getAsync('SELECT * FROM transactions WHERE type = ? ORDER BY id DESC', ['task']);
      expect(transactions.amount).toBe(2.00);
    });

    it('should update balance immediately for auto-approved tasks', async () => {
      const user = await db.getAsync('SELECT * FROM users WHERE username = ?', ['taskuser']);
      expect(user.balance).toBe(7.00); // 5 (manual approval) + 2 (auto-approval)
    });
  });

  describe('POST /api/tasks/generate-default', () => {
    beforeAll(async () => {
      // Clean up any existing default tasks
      await db.runAsync('DELETE FROM tasks WHERE name LIKE ?', ['Clean your room']);
      await db.runAsync('DELETE FROM tasks WHERE name LIKE ?', ['Ranger sa chambre']);
    });

    it('should generate default tasks in English', async () => {
      const response = await request(app)
        .post('/api/tasks/generate-default')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ language: 'en' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Check that tasks were created
      const tasks = await db.allAsync('SELECT * FROM tasks WHERE name LIKE ?', ['Clean your room']);
      expect(tasks.length).toBe(1);
    });

    it('should generate default tasks in French', async () => {
      const response = await request(app)
        .post('/api/tasks/generate-default')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ language: 'fr' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);

      // Check that tasks were created
      const tasks = await db.allAsync('SELECT * FROM tasks WHERE name LIKE ?', ['Ranger sa chambre']);
      expect(tasks.length).toBe(1);
    });

    it('should not create duplicates', async () => {
      const initialCount = await db.getAsync('SELECT COUNT(*) as count FROM tasks');

      const response = await request(app)
        .post('/api/tasks/generate-default')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ language: 'en' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(0); // No new tasks created

      const finalCount = await db.getAsync('SELECT COUNT(*) as count FROM tasks');
      expect(finalCount.count).toBe(initialCount.count);
    });

    it('should require admin authentication', async () => {
      const response = await request(app)
        .post('/api/tasks/generate-default')
        .send({ language: 'en' });

      expect(response.status).toBe(401);
    });
  });
});