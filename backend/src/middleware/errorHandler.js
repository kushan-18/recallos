import { isDevelopment } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Express "middleware" = a function that runs between a request arriving
 * and the response being sent.
 */

// If no route matched, Express reaches this. Answer with a clean JSON 404.
export function notFound(req, res) {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// Safety net: if a route throws an error, respond with JSON instead of crashing.
// Express detects error handlers automatically by their 4 parameters.
export function errorHandler(err, req, res, next) {
  logger.error(err.message);

  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Something went wrong on the server',
    // Show the stack trace only during development (it can leak sensitive info).
    ...(isDevelopment && { stack: err.stack }),
  });
}
