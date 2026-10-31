/**
 * vectorIndex.js — attempt to create MongoDB Atlas Vector Search indexes.
 * Run: npm run index
 *
 * Tries to create two indexes:
 *   memories_vector_index    (on memories.embedding)
 *   knowledges_vector_index  (on knowledges.embedding)
 *
 * If Atlas supports it on your cluster → indexes are created and the
 * app automatically uses 'atlas-vector' mode.
 * If not (permissions/plan/region) → we SAY SO and the app keeps using
 * the cosine fallback. Either path is genuine embedding-based search.
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import env from '../config/env.js';

const INDEXES = [
  { collection: 'memories', name: 'memory_vector_index', path: 'embedding', needsCustomerFilter: true },
  { collection: 'knowledges', name: 'knowledge_vector_index', path: 'embedding' },
];

async function createIndexes() {
  await connectDB();
  const db = mongoose.connection.db;

  let allOk = true;

  for (const spec of INDEXES) {
    try {
      const existing = await db
        .collection(spec.collection)
        .listSearchIndexes()
        .toArray();

      if (existing.some((i) => i.name === spec.name)) {
        console.log(`✓ ${spec.name} already exists`);
        continue;
      }

      await db.collection(spec.collection).createSearchIndex({
        name: spec.name,
        type: 'vectorSearch',
        definition: {
          fields: [
            {
              type: 'vector',
              path: spec.path,
              numDimensions: env.embeddingDim,
              similarities: 'cosine',
            },
            // Memories are always queried per customer, so the index
            // needs this field to allow filtering inside $vectorSearch.
            ...(spec.needsCustomerFilter ? [{ type: 'filter', path: 'customerId' }] : []),
          ],
        },
      });

      // Index builds in the background; a short wait makes the next
      // query (and the app's automatic mode detection) succeed.
      console.log(`✓ ${spec.name} created — waiting 20s for it to build…`);
      await new Promise((r) => setTimeout(r, 20000));

      const after = await db.collection(spec.collection).listSearchIndexes().toArray();
      const state = after.find((i) => i.name === spec.name)?.queryable;
      console.log(`  queryable: ${state ? 'yes' : 'not yet — app will retry on next query'}`);
    } catch (err) {
      allOk = false;
      console.log(`✗ ${spec.name} could NOT be created: ${err.message}`);
    }
  }

  if (allOk) {
    console.log('\nAtlas Vector Search is ready. The app will report mode: atlas-vector');
  } else {
    console.log('\nAtlas Vector Search unavailable on this cluster.');
    console.log('The app will use cosine-fallback — still genuine embedding-based search.');
  }

  await mongoose.disconnect();
}

createIndexes().catch((err) => {
  console.error('Index setup failed:', err.message);
  process.exit(1);
});
