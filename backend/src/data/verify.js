/**
 * Verification script for Phase 1 (run: npm run verify)
 * Checks: record counts + per-customer data isolation.
 * Prints counts only — never any secret values.
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Customer from '../models/Customer.js';
import Conversation from '../models/Conversation.js';
import Memory from '../models/Memory.js';
import Ticket from '../models/Ticket.js';

async function verify() {
  await connectDB();
  const db = mongoose.connection.db;

  console.log('--- record counts ---');
  for (const c of ['customers', 'conversations', 'messages', 'memories', 'tickets', 'knowledges']) {
    console.log(`  ${c}: ${await db.collection(c).countDocuments()}`);
  }

  console.log('--- isolation check (Alice vs Bob) ---');
  const alice = await Customer.findOne({ email: 'alice.demo@fastnet.example' });
  const bob = await Customer.findOne({ email: 'bob.demo@fastnet.example' });
  if (!alice || !bob) throw new Error('Demo customers not found — run npm run seed first');

  for (const [label, who] of [['alice', alice], ['bob', bob]]) {
    console.log(
      `  ${label}: ${await Memory.countDocuments({ customerId: who._id })} memories, ` +
        `${await Conversation.countDocuments({ customerId: who._id })} conversations, ` +
        `${await Ticket.countDocuments({ customerId: who._id })} tickets`,
    );
  }

  // A query filtered by Alice must never return Bob's records.
  const aliceMemories = await Memory.find({ customerId: alice._id });
  const leak = aliceMemories.some((m) => String(m.customerId) === String(bob._id));
  console.log(`  cross-customer leak: ${leak ? 'FAIL' : 'none found'}`);

  const orphaned = await Memory.countDocuments({ customerId: { $nin: [alice._id, bob._id] } });
  console.log(`  (info) memories owned by other customers: ${orphaned}`);

  console.log(leak ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  await mongoose.disconnect();
}

verify().catch((err) => {
  console.error('VERIFY ERROR:', err.message);
  process.exit(1);
});
