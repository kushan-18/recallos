import { Schema, model } from 'mongoose';

/**
 * A customer of the ISP (demo data — no real people).
 * `isDemo: true` marks records created by the seed script.
 */
const customerSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    plan: { type: String, default: 'Basic' }, // e.g. Basic / Premium
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default model('Customer', customerSchema);
