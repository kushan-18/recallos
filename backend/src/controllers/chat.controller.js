/**
 * ============================================================================
 * chat.controller.js — POST /api/chat (THE core endpoint of the project)
 * ============================================================================
 * One customer message triggers this pipeline:
 *
 *   1. VALIDATE   customer + conversation (isolation: must belong together)
 *   2. RETRIEVE   their memories (Atlas Vector Search), company knowledge,
 *                  open tickets, recent messages
 *   3+4. ANSWER & LEARN in ONE Gemini call:
 *                 substantive message -> a single JSON call returns
 *                 {"reply": "...", "memories": [...]}   (1 generation call)
 *                 greeting/thanks     -> plain reply, extraction skipped
 *                 (also 1 generation call — nothing durable was said)
 *                 Saved memories are embedded → stored in MongoDB for
 *                 FUTURE conversations.
 *
 * The response reports exactly what was retrieved and what was saved —
 * so the UI (and the judges) can see the memory engine working.
 * ============================================================================
 */
import mongoose from 'mongoose';
import env from '../config/env.js';
import Customer from '../models/Customer.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Ticket from '../models/Ticket.js';
import { generateText, generateJson } from '../services/gemini.js';
import { searchCustomerMemories, saveExtractedMemories, getRetrievalMode } from '../services/memoryService.js';
import { searchKnowledge } from '../services/knowledgeService.js';
import logger from '../utils/logger.js';

/* -------------------------------------------------------------------------
 * Prompt 1: how the support agent is allowed to behave.
 * The rules below are the "must never invent" guarantee.
 * ---------------------------------------------------------------------- */
const CHAT_SYSTEM_PROMPT = `You are the customer support AI for FastNet, an internet service provider.

RULES — never break these:
1. Only state facts about THIS customer (complaints, statuses, refunds, plans, actions) if they appear in the MEMORIES, OPEN TICKETS or COMPANY KNOWLEDGE sections provided. If something is not there, say you don't know — offer to create a support ticket instead.
2. NEVER invent complaint statuses, refund outcomes, technician visits, deliveries or any completed action.
3. If memories show a previously reported issue, acknowledge that you already have the details so the customer never has to repeat themselves.
4. Use COMPANY KNOWLEDGE for policies, FAQs and troubleshooting steps. Quote timeframes (refund windows etc.) only from that section.
5. Be concise, warm and human. Plain text only, no markdown headers.`;

/* -------------------------------------------------------------------------
 * Prompt 2 (Phase 5 MERGE): the reply and the memory extraction happen in
 * ONE Gemini call that returns JSON — half the quota cost of the old
 * two-call pipeline, same rules.
 * ------------------------------------------------------------------------- */
const MERGED_SYSTEM_PROMPT = `You are the customer support AI for FastNet, an internet service provider.

Respond with JSON only, exactly this shape:
{"reply":"your message to the customer","memories":[{"action":"create","type":"issue|preference|fact|correction","content":"..."}]}

REPLY RULES — never break these:
1. Only state facts about THIS customer (complaints, statuses, refunds, plans, actions) if they appear in the MEMORIES, OPEN TICKETS or COMPANY KNOWLEDGE sections provided. If something is not there, say you don't know — offer to create a support ticket instead.
2. NEVER invent complaint statuses, refund outcomes, technician visits, deliveries or any completed action.
3. If memories show a previously reported issue, acknowledge that you already have the details so the customer never has to repeat themselves.
4. Use COMPANY KNOWLEDGE for policies, FAQs and troubleshooting steps. Quote timeframes (refund windows etc.) only from that section.
5. Be concise, warm and human. Plain text only, no markdown headers — the "reply" field is exactly what the customer will see.

MEMORY RULES (the "memories" array):
- Keep only DURABLE information: device models, recurring issues, customer preferences, plan facts, explicit corrections.
- Skip greetings, thanks, one-off questions and anything not stated in the conversation.
- If the customer CONTRADICTS an existing memory, output action:"update" with that memory's existingId (copied from the [id:...] marker in the prompt) and the corrected content.
- Never invent an existingId — only use ids shown in the prompt.
- Never duplicate an existing memory. Maximum 2 memories. If nothing is worth keeping, return "memories":[].`;

/** Build the context block Gemini sees (memories, tickets, knowledge, history). */
function buildChatUserText({ customer, memories, tickets, knowledge, recentMessages, message }) {
  const lines = [];

  lines.push(`[CUSTOMER] ${customer.name} — plan: ${customer.plan}`);

  if (memories.length) {
    lines.push('[MEMORIES ABOUT THIS CUSTOMER]');
    // [id:...] lets the merged call reference an existing memory when the
    // customer corrects it (existingId for action:"update").
    memories.forEach((m) => lines.push(`- (${m.type}) [id:${m._id}] ${m.content}`));
  } else {
    lines.push('[MEMORIES ABOUT THIS CUSTOMER] none yet');
  }

  if (tickets.length) {
    lines.push('[OPEN TICKETS — real, verified status only]');
    tickets.forEach((t) => lines.push(`- ${t.title} [${t.status}] — ${t.description}`));
  } else {
    lines.push('[OPEN TICKETS] none');
  }

  if (knowledge.length) {
    lines.push('[COMPANY KNOWLEDGE]');
    knowledge.forEach((k) => lines.push(`- ${k.title}: ${k.content}`));
  } else {
    lines.push('[COMPANY KNOWLEDGE] none');
  }

  if (recentMessages.length) {
    lines.push('[CONVERSATION SO FAR]');
    recentMessages.forEach((m) => lines.push(`${m.role}: ${m.content}`));
  }

  lines.push(`[CUSTOMER'S LATEST MESSAGE] ${message}`);
  lines.push('Reply to the customer now.');

  return lines.join('\n');
}

/* -------------------------------------------------------------------------
 * Phase 5: greetings and thank-yous contain nothing durable, so we skip
 * memory extraction for them (the reply itself still gets full context).
 * Conservative: ANY message that doesn't fully match is treated as
 * substantive, so we never lose real information.
 * Exported for offline testing (no AI call needed to verify it).
 * ---------------------------------------------------------------------- */
const TRIVIAL_RE =
  /^(?:[\s.,!?'"’-]*(?:hi+|hey|hello|yo|thanks|thank\s*you|thankyou|thx|ok|okay|yes|no|nope|yep|sure|bye|goodbye|good|great|awesome|perfect|cool|nice|wow|got\s*it|understood|cheers|there|again|everyone|folks|team|morning|evening|afternoon|a|lot|man|bro|mate|buddy|so\s*much|much\s*appreciated|appreciate\s*it)[\s.,!?'"’-]*)+$/i;

export function isTrivialMessage(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length > 80) return false; // long = substantive even if it opens with "thanks"
  return TRIVIAL_RE.test(t);
}

/**
 * POST /api/chat
 * body: { customerId, conversationId?, message }
 * conversationId omitted → a brand-new conversation is started
 * (this is how "memory across separate conversations" gets demonstrated).
 */
export async function postChat(req, res) {
  const { customerId, conversationId = null, message } = req.body || {};

  if (!customerId || !mongoose.isValidObjectId(customerId)) {
    return res.status(400).json({ status: 'error', message: 'customerId is required' });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ status: 'error', message: 'message is required' });
  }
  const text = String(message).trim().slice(0, 2000);

  // --- 1. VALIDATE (isolation enforced here) ---
  const customer = await Customer.findById(customerId);
  if (!customer) {
    return res.status(404).json({ status: 'error', message: 'Customer not found' });
  }

  let conversation;
  if (conversationId) {
    // Find it ONLY among this customer's conversations.
    conversation = await Conversation.findOne({ _id: conversationId, customerId: customer._id });
    if (!conversation) {
      return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    }
    if (conversation.status === 'human') {
      return res.status(409).json({
        status: 'error',
        message: 'A human agent has taken over this conversation.',
      });
    }
  }

  // Track whether THIS request created the conversation, so a failed
  // first send can be rolled back cleanly (see the catch block below).
  const createdHere = !conversationId;
  if (createdHere) {
    conversation = await Conversation.create({
      customerId: customer._id,
      title: text.slice(0, 48) + (text.length > 48 ? '…' : ''),
    });
  }

  // --- 2. RETRIEVE everything relevant, all scoped to this customer ---
  const [memories, knowledge, tickets, recentMessages] = await Promise.all([
    searchCustomerMemories(customer._id.toString(), text, 5),
    searchKnowledge(text, 3),
    Ticket.find({ customerId: customer._id, status: { $ne: 'resolved' } }),
    Message.find({ conversationId: conversation._id }).sort({ createdAt: -1 }).limit(10),
  ]);
  recentMessages.reverse(); // oldest → newest for the prompt

  let customerMessage;
  try {
    // Save the customer's message first so history is complete.
    customerMessage = await Message.create({ conversationId: conversation._id, role: 'customer', content: text });

    // --- 3+4. ANSWER and LEARN in ONE Gemini call -------------------------
    // Substantive message: a single JSON call returns {"reply","memories"}
    // (1 generation call instead of the old 2). Greeting/thanks: plain-text
    // reply only, extraction skipped — also exactly 1 call.
    // Failover (primary → backup on 429) lives untouched in gemini.js.
    const userText = buildChatUserText({ customer, memories, tickets, knowledge, recentMessages, message: text });

    let reply;
    let extractedMemories = [];
    let extraction;

    if (isTrivialMessage(text)) {
      extraction = 'skipped-trivial';
      reply = await generateText(CHAT_SYSTEM_PROMPT, userText);
    } else {
      extraction = 'merged-call';
      const merged = await generateJson(MERGED_SYSTEM_PROMPT, userText);
      reply = typeof merged?.reply === 'string' ? merged.reply.trim() : '';
      if (!reply) {
        const err = new Error('The AI returned an empty reply. Please try again.');
        err.status = 502;
        throw err; // rollback below keeps the DB matching what the screen shows
      }
      extractedMemories = Array.isArray(merged.memories) ? merged.memories : [];
    }

    await Message.create({ conversationId: conversation._id, role: 'ai', content: reply });

    // Save what the model decided to remember (new/updated text is embedded).
    // Failures here never break the chat — the reply is already saved.
    let memoryUpdates = { created: [], updated: [] };
    if (extractedMemories.length > 0) {
      try {
        memoryUpdates = await saveExtractedMemories(
          customer._id.toString(),
          conversation._id.toString(),
          extractedMemories,
        );
      } catch (err) {
        logger.warn(`Memory extraction failed (reply still delivered): ${err.message}`);
      }
    }

    // --- Respond: reply + full transparency about what was used/saved ---
    res.json({
      conversationId: conversation._id,
      reply,
      retrieval: {
        mode: getRetrievalMode(),
        memoriesUsed: memories.map((m) => ({ type: m.type, content: m.content, score: Number(m.score.toFixed(3)) })),
        knowledgeUsed: knowledge.map((k) => ({ title: k.title, score: Number(k.score.toFixed(3)) })),
      },
      memoryUpdates,
      // Honest reporting: how this turn's answer/memory extraction ran.
      extraction, // 'merged-call' | 'skipped-trivial'
      aiModel: env.geminiModel,
    });
  } catch (err) {
    // ROLLBACK: the AI could not answer (quota/timeout/service error).
    // The client removes the optimistic bubble and restores the draft, so
    // we remove the message here too — otherwise pressing Retry would
    // store it twice. A conversation created by this failed send is
    // removed as well, so no empty conversation is left behind.
    await Promise.allSettled([
      customerMessage ? Message.deleteOne({ _id: customerMessage._id }) : null,
      createdHere ? Conversation.deleteOne({ _id: conversation._id }) : null,
    ].filter(Boolean));
    throw err; // errorHandler turns this into a clear JSON error for the UI
  }
}
