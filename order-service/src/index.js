require('dotenv').config();
const app = require('./app');
const { initDB } = require('./db');

const PORT = process.env.PORT || 3003;

async function startServer() {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Order Service] Running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Order Service] Fatal startup error:', err);
  process.exit(1);
});
