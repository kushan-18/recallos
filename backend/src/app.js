import express from 'express';
import cors from 'cors';
import env from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

// app.js BUILDS the Express app (the rules of the API).
// server.js STARTS it (makes it listen on a port).
// Keeping them separate makes the code easier to grow later.

const app = express();

// --- Global middleware (run for every request) -----------------------------
// cors: lets the frontend (on a different port or domain) talk to this API.
// CORS_ORIGIN accepts a comma-separated list, e.g.:
//   CORS_ORIGIN=http://localhost:5173,https://your-site.netlify.app
const allowedOrigins = env.corsOrigins;
app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (curl, server-to-server, health checks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false); // browser blocks it; no CORS headers sent
    },
  }),
);
// express.json: automatically reads JSON bodies sent by the frontend.
app.use(express.json());

// --- Routes ----------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the AI Customer Support API',
    health: '/api/health',
  });
});

// All feature routes are mounted under /api (see routes/index.js).
app.use('/api', apiRoutes);

// --- Error handling (must come after the routes) ---------------------------
app.use(notFound);
app.use(errorHandler);

export default app;
