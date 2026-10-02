const db = require('../db');

exports.getAllProducts = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, description, price::float, stock, created_at AS "createdAt", updated_at AS "updatedAt" FROM products_service.products ORDER BY id ASC'
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error fetching products.' });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT id, name, description, price::float, stock, created_at AS "createdAt", updated_at AS "updatedAt" FROM products_service.products WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error fetching product.' });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { name, description, price, stock } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Product name and price are required.' });
    }

    const numPrice = parseFloat(price);
    const numStock = stock !== undefined ? parseInt(stock, 10) : 0;

    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({ error: 'Price must be a non-negative number.' });
    }

    if (isNaN(numStock) || numStock < 0) {
      return res.status(400).json({ error: 'Stock must be a non-negative integer.' });
    }

    const result = await db.query(
      `INSERT INTO products_service.products (name, description, price, stock)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, price::float, stock, created_at AS "createdAt"`,
      [name, description || '', numPrice, numStock]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Internal server error creating product.' });
  }
};

exports.updateStock = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const { quantityChange } = req.body;

    if (quantityChange === undefined || typeof quantityChange !== 'number') {
      return res.status(400).json({ error: 'quantityChange (number) is required in body.' });
    }

    await client.query('BEGIN');

    // Select with lock
    const productResult = await client.query(
      'SELECT id, name, stock FROM products_service.products WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found.' });
    }

    const currentStock = productResult.rows[0].stock;
    const newStock = currentStock + quantityChange;

    if (newStock < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient stock for product ${productResult.rows[0].name}. Available: ${currentStock}, Requested: ${Math.abs(quantityChange)}.`
      });
    }

    const updateResult = await client.query(
      `UPDATE products_service.products
       SET stock = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, stock, updated_at AS "updatedAt"`,
      [newStock, id]
    );

    await client.query('COMMIT');
    res.status(200).json(updateResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Internal server error updating stock.' });
  } finally {
    client.release();
  }
};
