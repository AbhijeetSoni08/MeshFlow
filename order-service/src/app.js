const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const orderRoutes = require('./routes/orderRoutes');

const app = express();

app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'order-service', timestamp: new Date().toISOString() });
});

// Mount routes on /orders and root
app.use('/orders', orderRoutes);
app.use('/', orderRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

module.exports = app;
