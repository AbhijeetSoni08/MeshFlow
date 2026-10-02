require('dotenv').config();
const app = require('./app');
const { initDB } = require('./db');

const PORT = process.env.PORT || 3002;

async function startServer() {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Product Service] Running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Product Service] Fatal startup error:', err);
  process.exit(1);
});
