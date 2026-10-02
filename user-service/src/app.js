const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const userRoutes = require('./routes/userRoutes');

const app = express();

app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'user-service', timestamp: new Date().toISOString() });
});

// User routes (mount both with /users prefix and root for flexible ingress/mesh routing)
app.use('/users', userRoutes);
app.use('/', userRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

module.exports = app;
