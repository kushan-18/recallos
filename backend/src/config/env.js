import 'dotenv/config';

/**
 * Central place for every environment variable.
 *
 * Why: reading `process.env` all over the code is messy and error-prone.
 * Instead, the whole app imports its settings from this one file.
 * Every value has a safe default, so the app still runs without a .env file.
 */
const env = {
  // --- Server ---
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // --- AI (Gemini) ---
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  // Optional second key: used automatically if the primary key gets a 429.
  geminiApiKeyBackup: process.env.GEMINI_API_KEY_BACKUP || null,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  embeddingDim: Number(process.env.EMBEDDING_DIM) || 3072,

  // --- MongoDB ---
  mongodbUri: process.env.MONGODB_URI || null,
};

export const isProduction = env.nodeEnv === 'production';
export const isDevelopment = env.nodeEnv === 'development';

export default env;
