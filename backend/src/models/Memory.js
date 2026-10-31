import { Schema, model } from 'mongoose';

/**
 * A long-term FACT about one customer, extracted by the AI from chats.
 *
 * Examples:
 *   issue      -> "Router model XR-200 keeps disconnecting (3rd report)"
 *   preference -> "Prefers email contact over phone calls"
 *   fact       -> "Lives in a rural area with weak coverage"
 *   correction -> "Customer corrected: they have XR-200, not XR-100"
 *
 * `embedding` is the numeric vector used for semantic search
 * (find "internet keeps dropping" even if memory says "disconnecting").
 */
const memorySchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    type: { type: String, enum: ['issue', 'preference', 'fact', 'correction'], required: true },
    content: { type: String, required: true },
    embedding: { type: [Number], default: [] },
    // Which conversation this memory came from (for auditing)
    sourceConversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
  },
  { timestamps: true },
);

export default model('Memory', memorySchema);
