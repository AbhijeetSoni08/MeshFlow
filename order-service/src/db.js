const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'meshflow'}`,
  ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS orders_service;
      CREATE TABLE IF NOT EXISTS orders_service.orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders_service.order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders_service.orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL,
        product_name VARCHAR(150) NOT NULL,
        unit_price NUMERIC(10, 2) NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        subtotal NUMERIC(10, 2) NOT NULL
      );
    `);
    console.log('[Order Service] Database tables verified.');
  } catch (error) {
    console.error('[Order Service] Database initialization error:', error.message);
  } finally {
    client.release();
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  initDB
};
