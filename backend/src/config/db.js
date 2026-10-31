import mongoose from 'mongoose';
import dns from 'dns';
import env from './env.js';
import logger from '../utils/logger.js';

/**
 * WORKAROUND (Windows + virtual adapters like WSL/Hyper-V):
 * Some machines list dead DNS servers (old site-local `fec0::` entries),
 * which makes Node's raw DNS lookups fail with ECONNREFUSED — even though
 * normal apps still work. The MongoDB driver resolves its `mongodb+srv://`
 * hostname through this same Node resolver, so we point it at known-good
 * servers BEFORE connecting. Local DNS first, Google as backup.
 * If this ever fails, it is harmless: Node just keeps its default servers.
 */
try {
  dns.setServers(['10.13.80.7', '8.8.8.8', '1.1.1.1']);
} catch {
  /* keep Node's default DNS servers */
}

/**
 * Connect to MongoDB Atlas.
 *
 * mongoose.connect() opens the connection and keeps it alive.
 * We call this once when the server starts (see server.js).
 *
 * If MONGODB_URI is missing or still the placeholder, we warn loudly
 * instead of silently failing — the server keeps running so you can
 * still see error messages, but database features won't work.
 */
export async function connectDB() {
  if (!env.mongodbUri || env.mongodbUri.startsWith('your-')) {
    logger.warn('MONGODB_URI is not set — database features will NOT work.');
    logger.warn('Put your real Atlas connection string in backend/.env');
    return null;
  }

  try {
    await mongoose.connect(env.mongodbUri);
    logger.success(`MongoDB connected: ${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    throw err;
  }
}

/** Small helper so /api/health can report the connection state. */
export function dbStatus() {
  // Mongoose states: 0=disconnected 1=connected 2=connecting 3=disconnecting
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}
