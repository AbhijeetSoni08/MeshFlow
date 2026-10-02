const db = require('../db');
const userService = require('../services/userService');
const productService = require('../services/productService');

exports.createOrder = async (req, res) => {
  const { userId, items } = req.body;
  const authHeader = req.headers['authorization'];

  if (!userId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'userId and a non-empty items array are required.' });
  }

  // 1. Validate user with User Service
  try {
    const user = await userService.getUser(userId, authHeader);
    if (!user) {
      return res.status(404).json({ error: `User with ID ${userId} not found.` });
    }
  } catch (err) {
    return res.status(502).json({ error: `Failed to verify user: ${err.message}` });
  }

  // 2. Validate product details and prepare order line items
  const processedItems = [];
  const reservedStockItems = [];
  let totalAmount = 0;

  try {
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        throw new Error('Each item must have a valid productId and quantity > 0.');
      }

      const product = await productService.getProduct(item.productId);
      if (!product) {
        throw new Error(`Product with ID ${item.productId} not found.`);
      }

      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}.`);
      }

      // Reserve stock via Product Service
      await productService.adjustStock(item.productId, -item.quantity);
      reservedStockItems.push({ productId: item.productId, quantity: item.quantity });

      const unitPrice = parseFloat(product.price);
      const subtotal = Math.round(unitPrice * item.quantity * 100) / 100;
      totalAmount += subtotal;

      processedItems.push({
        productId: item.productId,
        productName: product.name,
        unitPrice,
        quantity: item.quantity,
        subtotal
      });
    }
  } catch (error) {
    // Compensate / Roll back reserved stock if intermediate failure occurs
    for (const reserved of reservedStockItems) {
      try {
        await productService.adjustStock(reserved.productId, reserved.quantity);
      } catch (rollbackErr) {
        console.error(`Rollback stock failed for product ${reserved.productId}:`, rollbackErr.message);
      }
    }
    return res.status(400).json({ error: error.message });
  }

  totalAmount = Math.round(totalAmount * 100) / 100;

  // 3. Persist order in PostgreSQL
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO orders_service.orders (user_id, total_amount, status)
       VALUES ($1, $2, 'CONFIRMED')
       RETURNING id, user_id AS "userId", total_amount::float AS "totalAmount", status, created_at AS "createdAt"`,
      [userId, totalAmount]
    );

    const order = orderResult.rows[0];

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO orders_service.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.productId, item.productName, item.unitPrice, item.quantity, item.subtotal]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...order,
      items: processedItems
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving order to DB:', error);

    // Rollback stock reservations
    for (const reserved of reservedStockItems) {
      try {
        await productService.adjustStock(reserved.productId, reserved.quantity);
      } catch (rollbackErr) {
        console.error(`Rollback stock failed for product ${reserved.productId}:`, rollbackErr.message);
      }
    }

    res.status(500).json({ error: 'Internal server error creating order.' });
  } finally {
    client.release();
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const orderResult = await db.query(
      `SELECT id, user_id AS "userId", total_amount::float AS "totalAmount", status, created_at AS "createdAt"
       FROM orders_service.orders WHERE id = $1`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderResult.rows[0];

    const itemsResult = await db.query(
      `SELECT product_id AS "productId", product_name AS "productName", unit_price::float AS "unitPrice", quantity, subtotal::float AS "subtotal"
       FROM orders_service.order_items WHERE order_id = $1`,
      [id]
    );

    order.items = itemsResult.rows;

    res.status(200).json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Internal server error fetching order.' });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const ordersResult = await db.query(
      `SELECT id, user_id AS "userId", total_amount::float AS "totalAmount", status, created_at AS "createdAt"
       FROM orders_service.orders ORDER BY id DESC`
    );

    res.status(200).json(ordersResult.rows);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error fetching orders.' });
  }
};
