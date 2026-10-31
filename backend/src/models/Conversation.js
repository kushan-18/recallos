import { Schema, model } from 'mongoose';

/**
 * One chat session between a customer and the AI (or a human employee
 * after a take-over).
 *
 * CRITICAL for data isolation: every conversation belongs to exactly
 * one customerId, and all queries MUST filter by it.
 */
const conversationSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    title: { type: String, default: 'New conversation' },
    // 'ai' = the bot is answering, 'human' = an employee took over
    status: { type: String, enum: ['ai', 'human'], default: 'ai' },
    // AI summary, generated when a conversation ends (Phase 4)
    summary: { type: String, default: null },
    // When that summary was generated (null = never)
    summaryAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default model('Conversation', conversationSchema);
