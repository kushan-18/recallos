/**
 * embed.js — backfill embedding vectors for existing records.
 * Run: npm run embed
 *
 * The seed script creates memories/knowledge as text only; this script
 * turns that text into vectors (3072 numbers) so semantic search can work.
 * Safe to re-run: only records with an empty embedding are processed.
 */
import { connectDB } from '../config/db.js';
import env from '../config/env.js';
import Memory from '../models/Memory.js';
import Knowledge from '../models/Knowledge.js';
import { embedText } from '../services/gemini.js';

async function embedAll() {
  if (!env.geminiApiKey || env.geminiApiKey.startsWith('your-')) {
    console.error('ERROR: GEMINI_API_KEY not set in backend/.env');
    process.exit(1);
  }
  await connectDB();

  let total = 0;

  const memories = await Memory.find({ $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }] });
  for (const m of memories) {
    m.embedding = await embedText(m.content);
    await m.save();
    total++;
    console.log(`  ✓ memory: ${m.content.slice(0, 60)}${m.content.length > 60 ? '…' : ''}`);
  }

  const knowledge = await Knowledge.find({ $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }] });
  for (const k of knowledge) {
    k.embedding = await embedText(`${k.title}. ${k.content}`);
    await k.save();
    total++;
    console.log(`  ✓ knowledge: ${k.title}`);
  }

  console.log(`\nEmbedded ${total} record(s) at dimension ${env.embeddingDim}.`);
  console.log('Nothing left to do if this says 0 — run it again after re-seeding.');
  await import('mongoose').then((m) => m.default.disconnect());
}

embedAll().catch((err) => {
  console.error('Embed failed:', err.message);
  process.exit(1);
});
