import app from './app.js';
import env from './config/env.js';
import logger from './utils/logger.js';
import { connectDB } from './config/db.js';

// Entry point of the backend:
//   1. Connect to MongoDB
//   2. THEN start the HTTP server
// (If the DB fails, we still start the server so /api/health can
//  tell you what's wrong instead of the app dying silently.)
async function start() {
  try {
    await connectDB();
  } catch (err) {
    logger.error('Starting without a database connection.');
  }

  app.listen(env.port, () => {
    logger.success(`AI Customer Support backend running at http://localhost:${env.port}`);
    logger.info(`Health check: http://localhost:${env.port}/api/health`);
  });
}

start();
