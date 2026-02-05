const request = require('supertest');
const app = require('../index');

describe('Server', () => {
  test('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});
