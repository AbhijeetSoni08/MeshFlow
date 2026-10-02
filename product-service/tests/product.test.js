const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

jest.mock('../src/db');

describe('Product Service Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status UP', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('UP');
      expect(res.body.service).toEqual('product-service');
    });
  });

  describe('GET /products', () => {
    it('should return list of products', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Pizza', description: 'Cheesy', price: 12.99, stock: 10 },
          { id: 2, name: 'Burger', description: 'Juicy', price: 8.99, stock: 20 }
        ]
      });

      const res = await request(app).get('/products');
      expect(res.statusCode).toEqual(200);
      expect(res.body.length).toEqual(2);
      expect(res.body[0].name).toEqual('Pizza');
    });
  });

  describe('POST /products', () => {
    it('should validate missing required fields', async () => {
      const res = await request(app)
        .post('/products')
        .send({ description: 'No name or price' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('required');
    });

    it('should create a new product', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 3,
          name: 'Pasta Carbonara',
          description: 'Creamy pancetta pasta',
          price: 15.00,
          stock: 25,
          createdAt: new Date().toISOString()
        }]
      });

      const res = await request(app)
        .post('/products')
        .send({
          name: 'Pasta Carbonara',
          description: 'Creamy pancetta pasta',
          price: 15.00,
          stock: 25
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.name).toEqual('Pasta Carbonara');
      expect(res.body.stock).toEqual(25);
    });
  });

  describe('GET /products/:id', () => {
    it('should return single product if found', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Pizza', price: 12.99, stock: 10 }]
      });

      const res = await request(app).get('/products/1');
      expect(res.statusCode).toEqual(200);
      expect(res.body.name).toEqual('Pizza');
    });

    it('should return 404 if product not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/products/999');
      expect(res.statusCode).toEqual(404);
    });
  });
});
