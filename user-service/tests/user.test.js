const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');
const bcrypt = require('bcryptjs');

// Mock db queries for clean, fast unit testing
jest.mock('../src/db');

describe('User Service Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status UP', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('UP');
      expect(res.body.service).toEqual('user-service');
    });
  });

  describe('POST /users/register', () => {
    it('should reject registration if fields are missing', async () => {
      const res = await request(app)
        .post('/users/register')
        .send({ email: 'test@example.com' });
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('required');
    });

    it('should register a new user successfully', async () => {
      // Mock existing check
      db.query.mockResolvedValueOnce({ rows: [] });
      // Mock insert
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'John Doe', email: 'john@example.com', createdAt: new Date().toISOString() }]
      });

      const res = await request(app)
        .post('/users/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123!'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.message).toEqual('User registered successfully');
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toEqual('john@example.com');
    });
  });

  describe('POST /users/login', () => {
    it('should login valid credentials and return JWT token', async () => {
      const passwordHash = await bcrypt.hash('secretPass', 10);
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
          password_hash: passwordHash,
          created_at: new Date().toISOString()
        }]
      });

      const res = await request(app)
        .post('/users/login')
        .send({
          email: 'john@example.com',
          password: 'secretPass'
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.name).toEqual('John Doe');
    });

    it('should return 401 on incorrect password', async () => {
      const passwordHash = await bcrypt.hash('secretPass', 10);
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
          password_hash: passwordHash
        }]
      });

      const res = await request(app)
        .post('/users/login')
        .send({
          email: 'john@example.com',
          password: 'wrongPassword'
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toEqual('Invalid email or password.');
    });
  });

  describe('GET /users/:id', () => {
    it('should return user profile if found', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'John Doe', email: 'john@example.com', createdAt: new Date().toISOString() }]
      });

      const res = await request(app).get('/users/1');
      expect(res.statusCode).toEqual(200);
      expect(res.body.id).toEqual(1);
      expect(res.body.name).toEqual('John Doe');
    });

    it('should return 404 if user not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/users/999');
      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toEqual('User not found.');
    });
  });
});
