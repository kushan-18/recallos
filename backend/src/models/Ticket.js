import { Schema, model } from 'mongoose';

/**
 * A support ticket/complaint raised by a customer.
 * Employees (and the AI) can change the status as work progresses.
 */
const ticketSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved'],
      default: 'open',
    },
  },
  { timestamps: true },
);

export default model('Ticket', ticketSchema);
