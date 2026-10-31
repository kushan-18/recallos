import { Schema, model } from 'mongoose';

/**
 * COMPANY knowledge: FAQs, policies, product info.
 *
 * This is deliberately a separate collection from customer Memory —
 * company facts apply to everyone, customer memories apply to one person.
 */
const knowledgeSchema = new Schema(
  {
    title: { type: String, required: true },
    category: { type: String, default: 'general' }, // e.g. billing, troubleshooting
    content: { type: String, required: true },
    embedding: { type: [Number], default: [] },
  },
  { timestamps: true },
);

export default model('Knowledge', knowledgeSchema);
