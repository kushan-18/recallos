import env from '../config/env.js';
import { dbStatus } from '../config/db.js';
import { detectMode, getRetrievalMode } from '../services/memoryService.js';

// Remember when this process started, so we can report uptime.
const startedAt = Date.now();

/**
 * GET /api/health
 *
 * A "health check" answers: is the server alive, is the database
 * reachable, and are the AI keys configured?
 * We (and later, monitoring tools) call it to verify everything works.
 *
 * The retrieval mode is determined by a cheap $vectorSearch probe with a
 * synthetic vector — ZERO Gemini calls, so this endpoint never spends AI
 * quota while telling the truth about which search method is active.
 */
export async function getHealth(req, res) {
  if (dbStatus() === 'connected' && getRetrievalMode() === 'not-tested-yet') {
    await detectMode(); // sets 'atlas-vector' or 'cosine-fallback' honestly
  }

  res.json({
    status: 'ok',
    service: 'ai-customer-support-backend',
    message: 'AI Customer Support backend is up and running',
    environment: env.nodeEnv,
    // Database connection state: connected / disconnected / connecting
    database: dbStatus(),
    // How memories are searched: 'atlas-vector' | 'cosine-fallback'
    retrieval: getRetrievalMode(),
    // Only report whether keys exist — NEVER return the values
    aiConfigured: Boolean(env.geminiApiKey && !env.geminiApiKey.startsWith('your-')),
    // Optional second key for 429 quota failover — boolean only
    aiBackupConfigured: Boolean(env.geminiApiKeyBackup && !env.geminiApiKeyBackup.startsWith('your-')),
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
}
