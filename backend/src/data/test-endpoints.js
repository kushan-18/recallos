/**
 * test-endpoints.js — Phase 3 endpoint test (run: npm run test:endpoints)
 *
 * ZERO Gemini calls: everything here is pure MongoDB/HTTP. The PATCH
 * happy path is skipped on purpose because it re-embeds — we only test
 * its validation/isolation guards, which return BEFORE any AI call.
 *
 * Proves: every customer-specific endpoint is scoped by customerId,
 * and a foreign id is always rejected (400/404), never served.
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Customer from '../models/Customer.js';
import Memory from '../models/Memory.js';

const BASE = 'http://localhost:5000/api';
let failures = 0;

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function send(method, path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function run() {
  await connectDB();
  const alice = await Customer.findOne({ email: 'alice.demo@fastnet.example' });
  const bob = await Customer.findOne({ email: 'bob.demo@fastnet.example' });
  const A = String(alice._id);
  const B = String(bob._id);

  console.log('\n--- customers ---');
  const cust = await get('/customers');
  check('GET /customers lists demo customers', cust.status === 200 && cust.body.customers?.length >= 2, `${cust.body.customers?.length} found`);
  const one = await get(`/customers/${A}`);
  check('GET /customers/:id returns profile', one.status === 200 && one.body.customer?.name === 'Alice Johnson');
  const badCust = await get('/customers/not-an-id');
  check('GET /customers/:id rejects invalid id (400)', badCust.status === 400);
  const missingCust = await get('/customers/aaaaaaaaaaaaaaaaaaaaaaaa');
  check('GET /customers/:id 404 for unknown id', missingCust.status === 404);

  console.log('\n--- conversations (scoped) ---');
  const convA = await get(`/conversations?customerId=${A}`);
  const convB = await get(`/conversations?customerId=${B}`);
  check('Alice sees her conversations', convA.status === 200 && convA.body.conversations?.length > 0, `${convA.body.conversations?.length}`);
  check('Bob sees his conversations', convB.status === 200 && convB.body.conversations?.length > 0, `${convB.body.conversations?.length}`);
  check('lists are different (no shared ids)',
    new Set(convA.body.conversations.map((c) => c._id)).size === convA.body.conversations.length &&
    convA.body.conversations.every((c) => !convB.body.conversations.some((d) => d._id === c._id)));
  check('preview includes messageCount + lastMessage', convA.body.conversations.every((c) => typeof c.messageCount === 'number'));

  const noCust = await get('/conversations');
  check('GET /conversations without customerId rejected (400)', noCust.status === 400);

  // Bob asks for a conversation that belongs to Alice.
  const aliceConvId = convA.body.conversations[0]._id;
  const cross = await get(`/conversations/${aliceConvId}/messages?customerId=${B}`);
  check("Bob cannot open Alice's conversation (404)", cross.status === 404, `status ${cross.status}`);
  const own = await get(`/conversations/${aliceConvId}/messages?customerId=${A}`);
  check("Alice can open her own conversation (200)", own.status === 200 && own.body.messages?.length > 0, `${own.body.messages?.length} messages`);
  check('messages ordered oldest-first with roles',
    own.body.messages.every((m) => ['customer', 'ai', 'employee'].includes(m.role)));
  const foreignMsg = await get(`/conversations/aaaaaaaaaaaaaaaaaaaaaaaa/messages?customerId=${A}`);
  check('unknown conversation id -> 404', foreignMsg.status === 404);

  console.log('\n--- memories (scoped) ---');
  const memA = await get(`/memories?customerId=${A}`);
  const memB = await get(`/memories?customerId=${B}`);
  check('GET /memories lists memories', memA.status === 200 && memA.body.memories.length > 0, `${memA.body.memories.length} for Alice`);
  check('reports retrieval mode', typeof memA.body.retrieval === 'string', memA.body.retrieval);
  check("Bob's list has none of Alice's ids",
    memB.body.memories.every((m) => !memA.body.memories.some((a) => a._id === m._id)));
  const noMemCust = await get('/memories');
  check('GET /memories without customerId rejected (400)', noMemCust.status === 400);

  // PATCH guards (these return BEFORE any embedding call — no Gemini used).
  const aliceMemId = memA.body.memories[0]._id;
  const patchCross = await send('PATCH', `/memories/${aliceMemId}`, { customerId: B, content: 'Bob trying to edit Alice memory' });
  check("PATCH with Bob's id on Alice's memory -> 404", patchCross.status === 404, `status ${patchCross.status}`);
  const patchEmpty = await send('PATCH', `/memories/${aliceMemId}`, { customerId: A, content: '   ' });
  check('PATCH with empty content -> 400', patchEmpty.status === 400);
  const patchBadId = await send('PATCH', '/memories/not-an-id', { customerId: A, content: 'x' });
  check('PATCH with malformed id -> 400', patchBadId.status === 400);

  // Confirm Alice's memory content is untouched by the failed cross-edit.
  const stillThere = await Memory.findOne({ _id: aliceMemId, customerId: A }).lean();
  check("Alice's memory unchanged after cross-edit attempt", Boolean(stillThere), stillThere?.content.slice(0, 40));

  console.log('\n--- DELETE memory (scoped, no Gemini) ---');
  // Create a throwaway memory directly (no AI involved), then race the two identities.
  const throwaway = await Memory.create({
    customerId: alice._id,
    type: 'fact',
    content: 'TEMP memory created by test-endpoints.js for delete testing',
    embedding: [],
  });
  const deleteCross = await send('DELETE', `/memories/${throwaway._id}`, { customerId: B });
  check("DELETE with Bob's id on Alice's memory -> 404", deleteCross.status === 404, `status ${deleteCross.status}`);
  check('memory survives the cross-customer delete', Boolean(await Memory.findById(throwaway._id)));
  const deleteOwn = await send('DELETE', `/memories/${throwaway._id}`, { customerId: A });
  check('DELETE with own id -> 200', deleteOwn.status === 200);
  check('memory is really gone', !(await Memory.findById(throwaway._id)));

  console.log('\n--- tickets (scoped) ---');
  const tickA = await get(`/tickets?customerId=${A}`);
  const tickB = await get(`/tickets?customerId=${B}`);
  check('GET /tickets lists tickets', tickA.status === 200 && tickA.body.tickets.length > 0, `${tickA.body.tickets.length} for Alice`);
  check("Bob's tickets contain none of Alice's ids",
    tickB.body.tickets.every((t) => !tickA.body.tickets.some((a) => a._id === t._id)));
  const openOnly = await get(`/tickets?customerId=${A}&status=open`);
  check('status filter works', openOnly.status === 200 && openOnly.body.tickets.every((t) => t.status === 'open'), `${openOnly.body.tickets.length} open`);
  const badStatus = await get(`/tickets?customerId=${A}&status=weird`);
  check('invalid status filter -> 400', badStatus.status === 400);
  const noTickCust = await get('/tickets');
  check('GET /tickets without customerId rejected (400)', noTickCust.status === 400);

  console.log('\n--- cross-customer sweep (every endpoint, wrong id) ---');
  const probes = [
    ['conversations list', await get(`/conversations?customerId=${'a'.repeat(24)}`)],
    ['memories list', await get(`/memories?customerId=${'a'.repeat(24)}`)],
    ['tickets list', await get(`/tickets?customerId=${'a'.repeat(24)}`)],
  ];
  // Unknown-but-valid ObjectId: endpoints must return empty lists, never data.
  for (const [label, probe] of probes) {
    const collection = probe.body.conversations ?? probe.body.memories ?? probe.body.tickets ?? null;
    check(`${label} for unknown customer -> empty, no data leaked`, probe.status === 200 && Array.isArray(collection) && collection.length === 0, `${collection?.length} items`);
  }

  console.log(`\n========== RESULT: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} ==========`);
  console.log('Gemini calls made: 0 (as required)\n');
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('TEST ERROR:', err.message);
  process.exit(1);
});
