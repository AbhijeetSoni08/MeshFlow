require('dotenv').config();
const app = require('./app');
const { initDB } = require('./db');

const PORT = process.env.PORT || 3001;

async function startServer() {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[User Service] Running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[User Service] Fatal startup error:', err);
  process.exit(1);
});
