const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');
const userService = require('../src/services/userService');
const productService = require('../src/services/productService');

jest.mock('../src/db');
jest.mock('../src/services/userService');
jest.mock('../src/services/productService');

describe('Order Service Unit Tests', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    db.pool = {
      connect: jest.fn().mockResolvedValue(mockClient)
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status UP', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('UP');
      expect(res.body.service).toEqual('order-service');
    });
  });

  describe('POST /orders', () => {
    it('should reject order when items are empty', async () => {
      const res = await request(app)
        .post('/orders')
        .send({ userId: 1, items: [] });

      expect(res.statusCode).toEqual(400);
    });

    it('should return 404 when user does not exist in User Service', async () => {
      userService.getUser.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/orders')
        .send({
          userId: 999,
          items: [{ productId: 1, quantity: 2 }]
        });

      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toContain('User with ID 999 not found');
    });

    it('should create order when user and product stock are valid', async () => {
      userService.getUser.mockResolvedValueOnce({ id: 1, name: 'Alex' });
      productService.getProduct.mockResolvedValueOnce({
        id: 1,
        name: 'Artisan Margherita Pizza',
        price: 14.99,
        stock: 10
      });
      productService.adjustStock.mockResolvedValueOnce({ id: 1, stock: 8 });

      // Mock database transaction queries
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 101, userId: 1, totalAmount: 29.98, status: 'CONFIRMED', createdAt: new Date().toISOString() }]
        }) // INSERT order
        .mockResolvedValueOnce({}) // INSERT order_item
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post('/orders')
        .send({
          userId: 1,
          items: [{ productId: 1, quantity: 2 }]
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.id).toEqual(101);
      expect(res.body.status).toEqual('CONFIRMED');
      expect(res.body.totalAmount).toEqual(29.98);
      expect(res.body.items.length).toEqual(1);
      expect(productService.adjustStock).toHaveBeenCalledWith(1, -2);
    });

    it('should rollback stock and reject order when stock is insufficient', async () => {
      userService.getUser.mockResolvedValueOnce({ id: 1, name: 'Alex' });
      productService.getProduct.mockResolvedValueOnce({
        id: 1,
        name: 'Artisan Margherita Pizza',
        price: 14.99,
        stock: 1
      });

      const res = await request(app)
        .post('/orders')
        .send({
          userId: 1,
          items: [{ productId: 1, quantity: 5 }]
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('Insufficient stock');
    });
  });

  describe('GET /orders/:id', () => {
    it('should return order with items', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 101, userId: 1, totalAmount: 29.98, status: 'CONFIRMED', createdAt: new Date().toISOString() }]
        })
        .mockResolvedValueOnce({
          rows: [{ productId: 1, productName: 'Artisan Margherita Pizza', unitPrice: 14.99, quantity: 2, subtotal: 29.98 }]
        });

      const res = await request(app).get('/orders/101');
      expect(res.statusCode).toEqual(200);
      expect(res.body.id).toEqual(101);
      expect(res.body.items.length).toEqual(1);
    });

    it('should return 404 if order does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/orders/999');
      expect(res.statusCode).toEqual(404);
    });
  });
});
