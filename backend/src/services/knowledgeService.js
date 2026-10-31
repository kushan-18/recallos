/**
 * knowledgeService.js — semantic search over COMPANY knowledge
 * (FAQs, policies, product info). Separate from customer memories:
 * this data is shared by everyone and never carries a customerId.
 *
 * Uses the same two retrieval paths as memoryService:
 * Atlas Vector Search first, cosine fallback otherwise.
 */
import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import Knowledge from '../models/Knowledge.js';
import { embedText } from './gemini.js';

const VECTOR_INDEX = 'knowledge_vector_index'; // matches the index that exists in Atlas

let mode = 'not-tested-yet';

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

async function detectMode() {
  if (mode !== 'not-tested-yet') return mode;
  try {
    const probe = new Array(env.embeddingDim).fill(0.001);
    await mongoose.connection.db
      .collection('knowledges')
      .aggregate([
        { $vectorSearch: { index: VECTOR_INDEX, path: 'embedding', queryVector: probe, numCandidates: 10, limit: 1 } },
      ])
      .toArray();
    mode = 'atlas-vector';
    logger.info('Knowledge retrieval mode: Atlas Vector Search');
  } catch (err) {
    mode = 'cosine-fallback';
    logger.warn(`Knowledge retrieval mode: cosine fallback (${err.message})`);
  }
  return mode;
}

/**
 * Find the company articles most relevant to a query.
 * No customer filter here on purpose — company knowledge is shared.
 */
export async function searchKnowledge(queryText, limit = 3) {
  const active = await detectMode();
  const queryVector = await embedText(queryText);

  if (active === 'atlas-vector') {
    try {
      return await mongoose.connection.db
        .collection('knowledges')
        .aggregate([
          {
            $vectorSearch: {
              index: VECTOR_INDEX,
              path: 'embedding',
              queryVector,
              numCandidates: Math.max(limit * 20, 50),
              limit,
            },
          },
          { $project: { title: 1, category: 1, content: 1, score: { $meta: 'vectorSearchScore' } } },
        ])
        .toArray();
    } catch (err) {
      mode = 'cosine-fallback';
      logger.warn(`Atlas Vector Search failed for knowledge, using cosine: ${err.message}`);
    }
  }

  const candidates = await Knowledge.find({ embedding: { $exists: true, $ne: [] } })
    .select('title category content embedding')
    .lean();

  return candidates
    .map((k) => ({ _id: k._id, title: k.title, category: k.category, content: k.content, score: cosine(queryVector, k.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
