/**
 * memory.controller.js — the customer-facing "what the AI remembers" API.
 *
 *   GET    /api/memories?customerId=        list this customer's memories
 *   PATCH  /api/memories/:id                correct one memory (re-embedded)
 *   DELETE /api/memories/:id                forget one memory
 *
 * ISOLATION: every query filters by customerId, so an id belonging to
 * another customer always returns 404 — editing/deleting only ever works
 * on YOUR OWN memories, even if someone guesses or pastes a foreign id.
 */
import mongoose from 'mongoose';
import Memory from '../models/Memory.js';
import { embedText } from '../services/gemini.js';
import { getRetrievalMode } from '../services/memoryService.js';
import logger from '../utils/logger.js';

/**
 * GET /api/memories?customerId=...
 * Everything we remember about this customer, newest first.
 * No AI call is made here — embeddings are only (re)computed on edit.
 */
export async function listMemories(req, res) {
  const { customerId } = req.query;
  if (!customerId || !mongoose.isValidObjectId(customerId)) {
    return res.status(400).json({ status: 'error', message: 'customerId is required' });
  }

  const memories = await Memory.find({ customerId })
    .sort({ updatedAt: -1 })
    .select('type content sourceConversationId createdAt updatedAt embedding')
    .lean();

  res.json({
    retrieval: getRetrievalMode(),
    memories: memories.map((m) => ({
      _id: m._id,
      type: m.type,
      content: m.content,
      sourceConversationId: m.sourceConversationId,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      // Report honestly whether this memory can currently be found by
      // semantic search (an edited memory whose re-embed failed has none).
      embedded: Array.isArray(m.embedding) && m.embedding.length > 0,
    })),
  });
}

/**
 * PATCH /api/memories/:id   body: { customerId, content }
 * Correct a memory. The text is re-embedded immediately so semantic
 * search matches the NEW wording, not the old one.
 *
 * If the embedding service is unavailable (quota/timeout), the text is
 * still corrected and the vector is cleared — search then skips this
 * record until `npm run embed` backfills it. We never leave a stale
 * vector behind, because that would silently return wrong matches.
 */
export async function updateMemory(req, res) {
  const { id } = req.params;
  const { customerId, content } = req.body || {};

  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(customerId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid id or customerId' });
  }

  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ status: 'error', message: 'content is required' });
  if (text.length > 500) {
    return res.status(400).json({ status: 'error', message: 'content too long (max 500 characters)' });
  }

  // ISOLATION: _id AND customerId must match — else 404.
  const memory = await Memory.findOne({ _id: id, customerId });
  if (!memory) {
    return res.status(404).json({ status: 'error', message: 'Memory not found' });
  }

  memory.content = text;
  try {
    memory.embedding = await embedText(text);
  } catch (err) {
    memory.embedding = [];
    logger.warn(`Re-embedding failed after memory edit (text saved, vector cleared): ${err.message}`);
  }
  await memory.save();

  res.json({
    status: 'ok',
    embedded: memory.embedding.length > 0,
    memory: { _id: memory._id, type: memory.type, content: memory.content, updatedAt: memory.updatedAt },
  });
}

/**
 * DELETE /api/memories/:id   body: { customerId }
 * Permanently forget one memory.
 */
export async function deleteMemory(req, res) {
  const { id } = req.params;
  const { customerId } = req.body || {};

  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(customerId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid id or customerId' });
  }

  const memory = await Memory.findOneAndDelete({ _id: id, customerId });
  if (!memory) {
    return res.status(404).json({ status: 'error', message: 'Memory not found' });
  }

  res.json({ status: 'ok', deletedId: id });
}
