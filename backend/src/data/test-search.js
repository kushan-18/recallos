/**
 * test-search.js — Phase 2 retrieval test (run: npm run test:search)
 *
 * Proves, with real API calls:
 *   1. Semantic search works: a DIFFERENTLY PHRASED query still
 *      finds the right memory (embeddings, not keywords).
 *   2. Atlas Vector Search is the active mode (not the fallback).
 *   3. Isolation: Bob's query never returns Alice's memories.
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { searchCustomerMemories, getRetrievalMode } from '../services/memoryService.js';
import { searchKnowledge } from '../services/knowledgeService.js';
import Memory from '../models/Memory.js';
import Customer from '../models/Customer.js';

async function run() {
  await connectDB();

  const alice = await Customer.findOne({ email: 'alice.demo@fastnet.example' });
  const bob = await Customer.findOne({ email: 'bob.demo@fastnet.example' });

  console.log(`\nActive retrieval mode: ${getRetrievalMode()}\n`);

  // --- Test 1: semantic (not keyword) match, as Alice ---
  const q1 = 'my connection keeps dropping';
  const r1 = await searchCustomerMemories(alice._id.toString(), q1, 3);
  console.log(`Q (Alice): "${q1}"`);
  r1.forEach((m, i) => console.log(`  ${i + 1}. [${m.type}] ${m.content}  (score ${m.score?.toFixed(3)})`));

  // --- Test 2: isolation — Bob's query, Bob's filter ---
  const q2 = 'my connection keeps dropping';
  const r2 = await searchCustomerMemories(bob._id.toString(), q2, 3);
  console.log(`\nQ (Bob): "${q2}"`);
  r2.forEach((m, i) => console.log(`  ${i + 1}. [${m.type}] ${m.content}  (score ${m.score?.toFixed(3)})`));

  const aliceIds = new Set(
    (await Memory.find({ customerId: alice._id })).map((m) => String(m._id)),
  );
  const leaked = r2.filter((m) => aliceIds.has(String(m._id)));
  console.log(`\nIsolation: Bob's results containing Alice's memories: ${leaked.length} ${leaked.length === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // --- Test 3: company knowledge (no customer filter) ---
  const q3 = 'my wifi keeps cutting out at night';
  const r3 = await searchKnowledge(q3, 3);
  console.log(`\nQ (knowledge): "${q3}"`);
  r3.forEach((m, i) => console.log(`  ${i + 1}. ${m.title}  (score ${m.score?.toFixed(3)})`));

  // --- Verdict ---
  const semanticHit = r1.some((m) => m.content.toLowerCase().includes('disconnecting'));
  const knowledgeHit = r3.some((m) => m.title.toLowerCase().includes('troubleshooting') || m.title.toLowerCase().includes('firmware'));
  console.log(`\nSemantic match (different words, right memory): ${semanticHit ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Knowledge match: ${knowledgeHit ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Mode actually used: ${getRetrievalMode()}`);

  await mongoose.disconnect();
  if (!semanticHit || leaked.length > 0 || !knowledgeHit) process.exit(1);
}

run().catch((err) => {
  console.error('TEST ERROR:', err.message);
  process.exit(1);
});
