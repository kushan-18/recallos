/**
 * conversation.controller.js — the chat sidebar + conversation history API.
 *
 * ISOLATION RULE (applies to every function here):
 * a conversation is only ever returned if it belongs to the customerId
 * the client sent. Asking for someone else's conversation id returns 404
 * (we don't even confirm the id exists for another customer).
 *
 * None of these endpoints call Gemini — they only read MongoDB.
 */
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';

function invalidId(res, id, what) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ status: 'error', message: `Invalid ${what}` });
    return true;
  }
  return false;
}

/**
 * GET /api/conversations?customerId=...
 * This customer's conversations, most recently active first,
 * each with a small preview (message count + last line) for the sidebar.
 */
export async function listConversations(req, res) {
  const { customerId } = req.query;
  if (invalidId(res, customerId, 'customerId')) return;

  const conversations = await Conversation.find({ customerId })
    .sort({ updatedAt: -1 })
    .select('title status createdAt updatedAt')
    .lean();

  const withPreview = await Promise.all(
    conversations.map(async (c) => {
      const [messageCount, lastMessage] = await Promise.all([
        Message.countDocuments({ conversationId: c._id }),
        Message.findOne({ conversationId: c._id })
          .sort({ createdAt: -1 })
          .select('content role')
          .lean(),
      ]);
      return { ...c, messageCount, lastMessage: lastMessage?.content ?? null };
    }),
  );

  res.json({ conversations: withPreview });
}

/**
 * GET /api/conversations/:id/messages?customerId=...
 * The full thread of ONE conversation, oldest message first.
 */
export async function listMessages(req, res) {
  const { id } = req.params;
  const { customerId } = req.query;
  if (invalidId(res, id, 'conversation id')) return;
  if (invalidId(res, customerId, 'customerId')) return;

  // ISOLATION: _id AND customerId must match, otherwise 404.
  const conversation = await Conversation.findOne({ _id: id, customerId }).lean();
  if (!conversation) {
    return res.status(404).json({ status: 'error', message: 'Conversation not found' });
  }

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .select('role content createdAt')
    .lean();

  res.json({ conversation, messages });
}
