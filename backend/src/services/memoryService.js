/**
 * ============================================================================
 * memoryService.js — RETRIEVE and SAVE customer memories (the core engine)
 * ============================================================================
 * Two retrieval paths, both genuinely embedding-based:
 *
 *   1. 'atlas-vector'  — MongoDB Atlas Vector Search ($vectorSearch in the DB)
 *   2. 'cosine-fallback' — same embeddings, cosine similarity computed in Node
 *
 * We ATTEMPT Atlas Vector Search first. If the index is missing/unavailable,
 * we automatically use the cosine path. The active mode is logged, returned
 * in chat responses, and reported by /api/health — so we never pretend.
 *
 * ISOLATION: every retrieval is filtered by customerId. One customer's
 * memories can never appear in another customer's results.
 * ============================================================================
 */
import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import Memory from '../models/Memory.js';
import { embedText } from './gemini.js';

const VECTOR_INDEX = 'memory_vector_index'; // matches the index that exists in Atlas

let retrievalMode = 'not-tested-yet';

/** Current retrieval method — surfaced by /api/health and chat responses. */
export function getRetrievalMode() {
  return retrievalMode;
}

/** Cosine similarity between two equal-length vectors (-1 … 1). */
function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Try Atlas Vector Search once per process and remember the outcome.
 * A failure (index not created yet, permissions, unsupported tier)
 * permanently switches us to the cosine path until the server restarts.
 *
 * NOTE: the probe uses a synthetic zero vector — it costs ZERO Gemini calls,
 * so /api/health can honestly report the active mode at any time.
 */
export async function detectMode() {
  if (retrievalMode !== 'not-tested-yet') return retrievalMode;

  try {
    const probe = new Array(env.embeddingDim).fill(0.001);
    await mongoose.connection.db
      .collection('memories')
      .aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: 'embedding',
            queryVector: probe,
            numCandidates: 10,
            limit: 1,
          },
        },
      ])
      .toArray();
    retrievalMode = 'atlas-vector';
    logger.info('Memory retrieval mode: Atlas Vector Search');
  } catch (err) {
    retrievalMode = 'cosine-fallback';
    logger.warn(`Memory retrieval mode: cosine fallback (Atlas Vector Search unavailable: ${err.message})`);
  }
  return retrievalMode;
}

/**
 * Find the memories most semantically relevant to a query,
 * FOR ONE CUSTOMER ONLY.
 *
 * @param {string} customerId - the ONLY customer whose memories may match
 * @param {string} queryText - the customer's message
 * @param {number} limit - how many memories to return
 * @returns {Promise<Array<{_id, type, content, score}>>}
 */
export async function searchCustomerMemories(customerId, queryText, limit = 5) {
  const mode = await detectMode();
  const queryVector = await embedText(queryText);

  // --- Path 1: Atlas Vector Search (filtered to this customer) ---
  if (mode === 'atlas-vector') {
    try {
      const results = await mongoose.connection.db
        .collection('memories')
        .aggregate([
          {
            $vectorSearch: {
              index: VECTOR_INDEX,
              path: 'embedding',
              queryVector,
              numCandidates: Math.max(limit * 20, 50), // wider pool → better recall
              limit,
              filter: { customerId: { $eq: new mongoose.Types.ObjectId(customerId) } },
            },
          },
          {
            $project: {
              content: 1,
              type: 1,
              score: { $meta: 'vectorSearchScore' },
            },
          },
        ])
        .toArray();
      return results;
    } catch (err) {
      // Index vanished or is still building → downgrade for this process.
      retrievalMode = 'cosine-fallback';
      logger.warn(`Atlas Vector Search failed mid-query, using cosine: ${err.message}`);
    }
  }

  // --- Path 2: cosine similarity in Node (same embeddings, honest results) ---
  const candidates = await Memory.find({
    customerId: new mongoose.Types.ObjectId(customerId),
    embedding: { $exists: true, $ne: [] },
  })
    .select('type content embedding')
    .lean();

  return candidates
    .map((m) => ({ _id: m._id, type: m.type, content: m.content, score: cosine(queryVector, m.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const ALLOWED_TYPES = ['issue', 'preference', 'fact', 'correction'];

/**
 * Apply the AI's memory extraction: create new memories and update
 * outdated ones (customer corrections). Every update is forced through
 * a customerId filter — an id from another customer is silently ignored.
 *
 * @param {string} customerId
 * @param {string} conversationId - where the memory came from
 * @param {Array<{action,type,content,existingId}>} items - from Gemini
 */
export async function saveExtractedMemories(customerId, conversationId, items) {
  const created = [];
  const updated = [];
  if (!Array.isArray(items)) return { created, updated };

  const customerObjectId = new mongoose.Types.ObjectId(customerId);

  // Existing contents → skip duplicates cheaply (few memories per customer).
  const existing = await Memory.find({ customerId: customerObjectId }).lean();
  const normalizedExisting = new Set(existing.map((m) => m.content.trim().toLowerCase()));

  for (const item of items) {
    const content = String(item.content || '').trim();
    if (!content || content.length > 500) continue;

    const type = ALLOWED_TYPES.includes(item.type) ? item.type : 'fact';

    if (item.action === 'update' && item.existingId) {
      // ISOLATION: match _id AND customerId in one query.
      const target = await Memory.findOne({ _id: item.existingId, customerId: customerObjectId });
      if (!target) continue; // not ours → ignore, never touch another customer's data
      target.content = content;
      target.type = type;
      target.embedding = await embedText(content);
      target.sourceConversationId = conversationId;
      await target.save();
      updated.push({ _id: target._id, content, type });
      continue;
    }

    // create (with simple exact-duplicate guard)
    if (normalizedExisting.has(content.toLowerCase())) continue;
    const embedding = await embedText(content);
    const doc = await Memory.create({
      customerId: customerObjectId,
      type,
      content,
      embedding,
      sourceConversationId: conversationId,
    });
    normalizedExisting.add(content.toLowerCase());
    created.push({ _id: doc._id, content, type });
  }

  return { created, updated };
}
