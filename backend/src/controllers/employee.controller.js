/**
 * ============================================================================
 * employee.controller.js — the EMPLOYEE dashboard API (/api/employee/*)
 * ============================================================================
 * CLEARLY SEPARATE from the customer API:
 *   - customer routes (/api/conversations, /api/memories, ...) are always
 *     scoped by customerId — customers only ever see their own data.
 *   - employee routes (everything in this file) are privileged: support
 *     staff legitimately see ALL customers, so no customerId filter here.
 *   - DEMO NOTE: there is no login system in this hackathon demo. In a real
 *     product these routes would require an authenticated employee session.
 *
 * Endpoints:
 *   GET   /api/employee/overview                    — counts for the dashboard
 *   GET   /api/employee/customers                   — all customers + stats
 *   GET   /api/employee/customers/:id               — one profile (memories,
 *                                                     tickets, conversations)
 *   GET   /api/employee/conversations/:id           — full thread + customer
 *   POST  /api/employee/conversations/:id/takeover  — bot -> human
 *   POST  /api/employee/conversations/:id/handback  — human -> bot
 *   POST  /api/employee/conversations/:id/replies   — employee sends a message
 *   PATCH /api/employee/tickets/:id                 — change ticket status
 *   GET   /api/employee/conversations/:id/summary   — AI summary (the ONE
 *                                                     Gemini-backed endpoint
 *                                                     here; cached after first
 *                                                     generation)
 * ============================================================================
 */
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Memory from '../models/Memory.js';
import Ticket from '../models/Ticket.js';
import { generateText } from '../services/gemini.js';
import logger from '../utils/logger.js';

function invalidId(res, id, what) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ status: 'error', message: `Invalid ${what}` });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * 1. OVERVIEW
 * ------------------------------------------------------------------ */

/** GET /api/employee/overview — the numbers on the dashboard home. */
export async function getOverview(req, res) {
  const [customerCount, conversationsByStatus, openTicketCount, memoryCount, recentRaw] =
    await Promise.all([
      Customer.countDocuments(),
      Conversation.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Ticket.countDocuments({ status: { $ne: 'resolved' } }),
      Memory.countDocuments(),
      // customerId must stay in the select — it's how names get attached below.
      Conversation.find().sort({ updatedAt: -1 }).limit(6).select('title status updatedAt customerId').lean(),
    ]);

  // Turn the aggregate rows into a predictable object (missing = 0).
  const byStatus = { ai: 0, human: 0 };
  for (const row of conversationsByStatus) byStatus[row._id] = row.count;

  // Attach customer names to the recent-conversation feed.
  const recent = await Promise.all(
    recentRaw.map(async (c) => {
      const customer = await Customer.findById(c.customerId).select('name').lean();
      return { ...c, customerName: customer?.name ?? 'Unknown' };
    }),
  );

  res.json({
    counts: {
      customers: customerCount,
      activeConversations: byStatus.ai,
      humanConversations: byStatus.human,
      openTickets: openTicketCount,
      memories: memoryCount,
    },
    recentConversations: recent,
  });
}

/* ------------------------------------------------------------------ *
 * 2. CUSTOMER LIST + PROFILE
 * ------------------------------------------------------------------ */

/** GET /api/employee/customers — every customer with per-customer stats. */
export async function listAllCustomers(req, res) {
  const customers = await Customer.find().sort({ name: 1 }).lean();

  const withStats = await Promise.all(
    customers.map(async (c) => {
      const [conversationCount, memoryCount, openTicketCount] = await Promise.all([
        Conversation.countDocuments({ customerId: c._id }),
        Memory.countDocuments({ customerId: c._id }),
        Ticket.countDocuments({ customerId: c._id, status: { $ne: 'resolved' } }),
      ]);
      return { ...c, conversationCount, memoryCount, openTicketCount };
    }),
  );

  res.json({ customers: withStats });
}

/**
 * GET /api/employee/customers/:id — one customer's full profile:
 * everything the AI remembers, their tickets, and their conversations.
 */
export async function getCustomerProfile(req, res) {
  const { id } = req.params;
  if (invalidId(res, id, 'customer id')) return;

  const customer = await Customer.findById(id).lean();
  if (!customer) {
    return res.status(404).json({ status: 'error', message: 'Customer not found' });
  }

  const [memories, tickets, conversationsRaw] = await Promise.all([
    Memory.find({ customerId: id }).sort({ updatedAt: -1 }).lean(),
    Ticket.find({ customerId: id }).sort({ updatedAt: -1 }).lean(),
    Conversation.find({ customerId: id }).sort({ updatedAt: -1 }).select('title status updatedAt').lean(),
  ]);

  // Sidebar-style previews for each conversation.
  const conversations = await Promise.all(
    conversationsRaw.map(async (c) => {
      const [messageCount, lastMessage] = await Promise.all([
        Message.countDocuments({ conversationId: c._id }),
        Message.findOne({ conversationId: c._id }).sort({ createdAt: -1 }).select('content').lean(),
      ]);
      return { ...c, messageCount, lastMessage: lastMessage?.content ?? null };
    }),
  );

  res.json({
    customer,
    // Report honestly whether each memory is currently searchable.
    memories: memories.map((m) => ({
      _id: m._id,
      type: m.type,
      content: m.content,
      updatedAt: m.updatedAt,
      embedded: Array.isArray(m.embedding) && m.embedding.length > 0,
    })),
    tickets,
    conversations,
  });
}

/* ------------------------------------------------------------------ *
 * 3. CONVERSATION HISTORY + TAKEOVER + REPLIES
 * ------------------------------------------------------------------ */

/** GET /api/employee/conversations/:id — full thread for the history view. */
export async function getConversationThread(req, res) {
  const { id } = req.params;
  if (invalidId(res, id, 'conversation id')) return;

  const conversation = await Conversation.findById(id).lean();
  if (!conversation) {
    return res.status(404).json({ status: 'error', message: 'Conversation not found' });
  }

  const [customer, messages] = await Promise.all([
    Customer.findById(conversation.customerId).select('name email plan').lean(),
    Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).select('role content createdAt').lean(),
  ]);

  res.json({ conversation, customer, messages });
}

/**
 * POST /api/employee/conversations/:id/takeover — the bot steps aside.
 * From now on POST /api/chat returns 409 for this conversation, and the
 * customer's input box is disabled (they see "a human agent has taken over").
 */
export async function takeOverConversation(req, res) {
  const { id } = req.params;
  if (invalidId(res, id, 'conversation id')) return;

  const conversation = await Conversation.findByIdAndUpdate(
    id,
    { status: 'human' },
    { new: true },
  ).select('title status customerId').lean();
  if (!conversation) {
    return res.status(404).json({ status: 'error', message: 'Conversation not found' });
  }

  res.json({ status: 'ok', conversation });
}

/** POST /api/employee/conversations/:id/handback — hand the chat back to the bot. */
export async function handBackToAI(req, res) {
  const { id } = req.params;
  if (invalidId(res, id, 'conversation id')) return;

  const conversation = await Conversation.findByIdAndUpdate(
    id,
    { status: 'ai' },
    { new: true },
  ).select('title status customerId').lean();
  if (!conversation) {
    return res.status(404).json({ status: 'error', message: 'Conversation not found' });
  }

  res.json({ status: 'ok', conversation });
}

/**
 * POST /api/employee/conversations/:id/replies — the employee answers as a
 * human. Guard: the conversation must be in 'human' status first (take over
 * before replying), so an employee can never silently post as if they were
 * the bot. NO Gemini call — a human is typing.
 */
export async function sendEmployeeReply(req, res) {
  const { id } = req.params;
  const { content } = req.body || {};
  if (invalidId(res, id, 'conversation id')) return;

  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ status: 'error', message: 'content is required' });
  if (text.length > 2000) {
    return res.status(400).json({ status: 'error', message: 'content too long (max 2000 characters)' });
  }

  const conversation = await Conversation.findById(id);
  if (!conversation) {
    return res.status(404).json({ status: 'error', message: 'Conversation not found' });
  }
  if (conversation.status !== 'human') {
    return res.status(409).json({
      status: 'error',
      message: 'Take over this conversation before replying.',
    });
  }

  const message = await Message.create({
    conversationId: conversation._id,
    role: 'employee',
    content: text,
  });

  // Touch updatedAt so the conversation bubbles to the top of customer lists.
  conversation.updatedAt = new Date();
  await conversation.save();

  res.json({ status: 'ok', message: { _id: message._id, role: message.role, content: message.content, createdAt: message.createdAt } });
}

/* ------------------------------------------------------------------ *
 * 4. TICKET STATUS
 * ------------------------------------------------------------------ */

/** PATCH /api/employee/tickets/:id — body: { status: open|in_progress|resolved } */
export async function updateTicketStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body || {};
  if (invalidId(res, id, 'ticket id')) return;

  const allowed = ['open', 'in_progress', 'resolved'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ status: 'error', message: `status must be one of: ${allowed.join(', ')}` });
  }

  const ticket = await Ticket.findByIdAndUpdate(id, { status }, { new: true }).lean();
  if (!ticket) {
    return res.status(404).json({ status: 'error', message: 'Ticket not found' });
  }

  res.json({ status: 'ok', ticket });
}

/* ------------------------------------------------------------------ *
 * 5. AI SUMMARY (the only Gemini-backed employee endpoint)
 * ------------------------------------------------------------------ */

const SUMMARY_SYSTEM_PROMPT =
  'You are a support-team assistant. Summarize the conversation between a customer ' +
  'and a support bot in at most 3 short sentences, plain text only. Cover: (1) the ' +
  "customer's main issue, (2) what was done or promised, (3) the next step if any. " +
  'Do not invent facts that are not in the conversation.';

/**
 * GET /api/employee/conversations/:id/summary?regenerate=true
 *
 * First call generates the summary with Gemini and CACHES it on the
 * conversation (summary + summaryAt) — later calls return the cached text
 * without touching Gemini, so browsing the dashboard never burns quota.
 * ?regenerate=true forces a fresh summary (1 Gemini generation call).
 */
export async function getConversationSummary(req, res) {
  const { id } = req.params;
  const regenerate = req.query.regenerate === 'true';
  if (invalidId(res, id, 'conversation id')) return;

  const conversation = await Conversation.findById(id).lean();
  if (!conversation) {
    return res.status(404).json({ status: 'error', message: 'Conversation not found' });
  }

  // Serve the cache unless a fresh one was explicitly requested.
  if (conversation.summary && !regenerate) {
    return res.json({ summary: conversation.summary, generated: false, summaryAt: conversation.summaryAt });
  }

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .select('role content')
    .lean();
  if (messages.length === 0) {
    return res.status(400).json({ status: 'error', message: 'This conversation has no messages yet.' });
  }

  const transcript = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  const summary = await generateText(
    SUMMARY_SYSTEM_PROMPT,
    `Conversation title: ${conversation.title}\n\n${transcript}`,
  );

  const summaryAt = new Date();
  await Conversation.findByIdAndUpdate(id, { summary, summaryAt });

  logger.info(`AI summary generated for conversation ${id}`);
  res.json({ summary, generated: true, summaryAt });
}
