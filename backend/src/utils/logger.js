/**
 * Tiny console logger with timestamps.
 * Keeps log messages consistent everywhere.
 * (A bigger project would use a library like winston or pino.)
 */
const stamp = () => new Date().toISOString();

const logger = {
  info: (...args) => console.log(`[${stamp()}] INFO `, ...args),
  warn: (...args) => console.warn(`[${stamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${stamp()}] ERROR`, ...args),
  success: (...args) => console.log(`[${stamp()}] OK   `, ...args),
};

export default logger;
