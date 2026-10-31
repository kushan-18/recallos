/**
 * test-employee.js — Phase 4 employee-dashboard test (npm run test:employee)
 *
 * ZERO Gemini calls, as required while quota is limited:
 *  - every endpoint is exercised except summary GENERATION (that path is
 *    only reachable when a conversation has messages and no cached summary;
 *    we test the cached path by writing the cache ourselves, and the
 *    "no messages" guard on an empty conversation)
 *  - takeover/reply/handback/ticket changes run on THROWAWAY records that
 *    are deleted at the end; one real conversation is borrowed to prove the
 *    409 chat guard after takeover, then handed back to the AI.
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Customer from '../models/Customer.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Ticket from '../models/Ticket.js';

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
  const A = String(alice._id);

  // Throwaway records — never touch the demo data with writes.
  const throwConv = await Conversation.create({ customerId: alice._id, title: 'TEMP employee-test conversation' });
  await Message.create({ conversationId: throwConv._id, role: 'customer', content: 'TEMP: my internet is down' });
  const throwEmpty = await Conversation.create({ customerId: alice._id, title: 'TEMP empty (no messages)' });
  const throwTicket = await Ticket.create({
    customerId: alice._id,
    title: 'TEMP employee-test ticket',
    description: 'created by test-employee.js',
    status: 'open',
  });

  try {
    console.log('\n--- overview ---');
    const ov = await get('/employee/overview');
    check('GET /employee/overview -> 200', ov.status === 200);
    check('counts include customers/openTickets/memories',
      typeof ov.body.counts?.customers === 'number' &&
      typeof ov.body.counts?.openTickets === 'number' &&
      typeof ov.body.counts?.memories === 'number' &&
      typeof ov.body.counts?.activeConversations === 'number' &&
      typeof ov.body.counts?.humanConversations === 'number',
      `customers=${ov.body.counts?.customers} openTickets=${ov.body.counts?.openTickets}`);
    check('recent conversations carry customer names',
      Array.isArray(ov.body.recentConversations) && ov.body.recentConversations.every((c) => typeof c.customerName === 'string'));

    console.log('\n--- customer list + profile ---');
    const list = await get('/employee/customers');
    check('GET /employee/customers -> 200 with both demo customers',
      list.status === 200 && list.body.customers?.length >= 2);
    const aliceEntry = list.body.customers?.find((c) => c._id === A);
    check('Alice entry has stats (conversations/memories/openTickets)',
      aliceEntry && typeof aliceEntry.conversationCount === 'number' && typeof aliceEntry.memoryCount === 'number');

    const prof = await get(`/employee/customers/${A}`);
    check('GET /employee/customers/:id -> 200 with memories+tickets+conversations',
      prof.status === 200 && Array.isArray(prof.body.memories) && Array.isArray(prof.body.tickets) && Array.isArray(prof.body.conversations),
      `${prof.body.memories?.length} memories, ${prof.body.tickets?.length} tickets, ${prof.body.conversations?.length} conversations`);
    const badProf = await get('/employee/customers/not-an-id');
    check('invalid customer id -> 400', badProf.status === 400);
    const missProf = await get('/employee/customers/aaaaaaaaaaaaaaaaaaaaaaaa');
    check('unknown customer id -> 404', missProf.status === 404);

    console.log('\n--- conversation thread ---');
    // Pick a REAL conversation with messages (never our TEMP throwaways).
    const withMsgs = prof.body.conversations.find((c) => c.messageCount > 0 && !/^TEMP/.test(c.title));
    const realConvId = String(withMsgs._id);
    const thread = await get(`/employee/conversations/${realConvId}`);
    check('GET /employee/conversations/:id -> 200 with customer+messages',
      thread.status === 200 && thread.body.customer?.name === 'Alice Johnson' && thread.body.messages?.length > 0,
      `${thread.body.messages?.length} messages`);
    const badThread = await get('/employee/conversations/not-an-id');
    check('invalid conversation id -> 400', badThread.status === 400);
    const missThread = await get('/employee/conversations/aaaaaaaaaaaaaaaaaaaaaaaa');
    check('unknown conversation id -> 404', missThread.status === 404);

    console.log('\n--- takeover / reply / handback (throwaway) ---');
    // Reply BEFORE takeover must be refused.
    const early = await send('POST', `/employee/conversations/${throwConv._id}/replies`, { content: 'too early' });
    check('employee reply before takeover -> 409', early.status === 409, early.body.message);

    const take = await send('POST', `/employee/conversations/${throwConv._id}/takeover`, {});
    check('takeover -> 200 and status=human', take.status === 200 && take.body.conversation?.status === 'human');
    const takeAgain = await send('POST', `/employee/conversations/${throwConv._id}/takeover`, {});
    check('takeover is idempotent', takeAgain.status === 200 && takeAgain.body.conversation?.status === 'human');

    const reply = await send('POST', `/employee/conversations/${throwConv._id}/replies`, { content: 'TEMP: an engineer will call you today.' });
    check('employee reply after takeover -> 200', reply.status === 200 && reply.body.message?.role === 'employee');
    check('reply persisted with role=employee',
      Boolean(await Message.findOne({ conversationId: throwConv._id, role: 'employee', content: /an engineer will call/ })));

    const emptyReply = await send('POST', `/employee/conversations/${throwConv._id}/replies`, { content: '   ' });
    check('empty reply -> 400', emptyReply.status === 400);
    const longReply = await send('POST', `/employee/conversations/${throwConv._id}/replies`, { content: 'x'.repeat(2001) });
    check('overlong reply -> 400', longReply.status === 400);
    const badReply = await send('POST', '/employee/conversations/not-an-id/replies', { content: 'x' });
    check('invalid conversation id -> 400', badReply.status === 400);
    const missReply = await send('POST', '/employee/conversations/aaaaaaaaaaaaaaaaaaaaaaaa/replies', { content: 'x' });
    check('unknown conversation id -> 404', missReply.status === 404);

    const back = await send('POST', `/employee/conversations/${throwConv._id}/handback`, {});
    check('handback -> 200 and status=ai', back.status === 200 && back.body.conversation?.status === 'ai');
    // After handback the reply guard applies again.
    const replyAfterBack = await send('POST', `/employee/conversations/${throwConv._id}/replies`, { content: 'sneaky' });
    check('reply after handback -> 409 again', replyAfterBack.status === 409);

    console.log('\n--- chat integration: takeover blocks the AI (no Gemini: 409 pre-check) ---');
    const realConv = await Conversation.findById(realConvId);
    const beforeStatus = realConv.status;
    await send('POST', `/employee/conversations/${realConvId}/takeover`, {});
    const blocked = await send('POST', '/chat', { customerId: A, conversationId: realConvId, message: 'should be blocked before Gemini' });
    check('POST /chat on a taken-over conversation -> 409 (no Gemini call)', blocked.status === 409, blocked.body.message);
    await send('POST', `/employee/conversations/${realConvId}/handback`, {});
    const restored = await Conversation.findById(realConvId);
    check('conversation handed back to its original status', restored.status === beforeStatus, beforeStatus);

    console.log('\n--- ticket status (throwaway) ---');
    const p1 = await send('PATCH', `/employee/tickets/${throwTicket._id}`, { status: 'in_progress' });
    check('PATCH ticket -> in_progress', p1.status === 200 && p1.body.ticket?.status === 'in_progress');
    check('change persisted in DB', (await Ticket.findById(throwTicket._id)).status === 'in_progress');
    const p2 = await send('PATCH', `/employee/tickets/${throwTicket._id}`, { status: 'resolved' });
    check('PATCH ticket -> resolved', p2.status === 200 && p2.body.ticket?.status === 'resolved');
    const badStatus = await send('PATCH', `/employee/tickets/${throwTicket._id}`, { status: 'weird' });
    check('invalid status -> 400', badStatus.status === 400);
    const badTicket = await send('PATCH', '/employee/tickets/not-an-id', { status: 'open' });
    check('invalid ticket id -> 400', badTicket.status === 400);
    const missTicket = await send('PATCH', '/employee/tickets/aaaaaaaaaaaaaaaaaaaaaaaa', { status: 'open' });
    check('unknown ticket id -> 404', missTicket.status === 404);

    console.log('\n--- AI summary: cached path + guards (NO Gemini) ---');
    // Write the cache ourselves -> endpoint must serve it without Gemini.
    await Conversation.findByIdAndUpdate(throwConv._id, {
      summary: 'TEMP cached summary: customer reported internet outage; engineer call promised.',
      summaryAt: new Date(),
    });
    const cached = await get(`/employee/conversations/${throwConv._id}/summary`);
    check('cached summary returned with generated=false', cached.status === 200 && cached.body.generated === false && /TEMP cached summary/.test(cached.body.summary));

    // Empty conversation: the "no messages" guard fires BEFORE any Gemini call.
    const emptySum = await get(`/employee/conversations/${throwEmpty._id}/summary`);
    check('summary of empty conversation -> 400 (guard before Gemini)', emptySum.status === 400, emptySum.body.message);
    const badSum = await get('/employee/conversations/not-an-id/summary');
    check('invalid summary id -> 400', badSum.status === 400);
    const missSum = await get('/employee/conversations/aaaaaaaaaaaaaaaaaaaaaaaa/summary');
    check('unknown summary id -> 404', missSum.status === 404);

    console.log('\n--- customer isolation unaffected by employee routes ---');
    const bobId = '6ae57ac6a350dfdc34286ed4';
    const bobOnAlice = await get(`/conversations/${realConvId}/messages?customerId=${bobId}`);
    check('customer API still 404s foreign conversations (Bob vs Alice)', bobOnAlice.status === 404);
  } finally {
    // Clean up every throwaway record — demo data stays pristine.
    await Promise.all([
      Conversation.deleteOne({ _id: throwConv._id }),
      Conversation.deleteOne({ _id: throwEmpty._id }),
      Message.deleteMany({ conversationId: throwConv._id }),
      Ticket.deleteOne({ _id: throwTicket._id }),
    ]);
    const leftovers = (await Conversation.countDocuments({ title: /^TEMP/ })) +
      (await Ticket.countDocuments({ title: /^TEMP/ }));
    console.log(`\n--- cleanup: ${leftovers === 0 ? 'all throwaway records removed' : leftovers + ' LEFTOVER(S)!' } ---`);
  }

  console.log(`\n========== RESULT: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} ==========`);
  console.log('Gemini calls made: 0 (summary generation intentionally not exercised)\n');
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('TEST ERROR:', err.message);
  process.exit(1);
});
