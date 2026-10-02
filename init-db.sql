-- Create isolated schemas for each microservice
CREATE SCHEMA IF NOT EXISTS users_service;
CREATE SCHEMA IF NOT EXISTS products_service;
CREATE SCHEMA IF NOT EXISTS orders_service;

-- Users Schema
CREATE TABLE IF NOT EXISTS users_service.users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products Schema
CREATE TABLE IF NOT EXISTS products_service.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Orders Schema
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

-- Initial seed data for menu
INSERT INTO products_service.products (name, description, price, stock)
VALUES 
  ('Artisan Margherita Pizza', 'Wood-fired sourdough with San Marzano tomatoes, fresh mozzarella, and basil', 14.99, 50),
  ('Black Truffle Burger', 'Prime Angus beef patty, aged cheddar, truffle aioli on brioche', 18.50, 40),
  ('Crispy Truffle Fries', 'Hand-cut russet potatoes tossed in white truffle oil and parmesan', 7.50, 60),
  ('Organic Acai Bowl', 'Acai blend topped with wild berries, granola, banana, and chia seeds', 11.25, 30)
ON CONFLICT DO NOTHING;
