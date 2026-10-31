import { Schema, model } from 'mongoose';

/**
 * A single chat message inside a conversation.
 * role: 'customer' (they typed it), 'ai' (bot reply), 'employee' (human reply)
 */
const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    role: { type: String, enum: ['customer', 'ai', 'employee'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true },
);

export default model('Message', messageSchema);
