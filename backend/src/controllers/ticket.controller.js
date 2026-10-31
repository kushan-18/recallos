/**
 * ticket.controller.js — the customer's support tickets (open/resolved).
 *
 * ISOLATION: tickets are only ever queried with the customerId the
 * client sent — a customer can never see anyone else's tickets.
 * Read-only: status changes belong to the employee dashboard (Phase 4).
 * No AI calls here.
 */
import mongoose from 'mongoose';
import Ticket from '../models/Ticket.js';

/** GET /api/tickets?customerId=...&status=open|in_progress|resolved (optional filter) */
export async function listTickets(req, res) {
  const { customerId, status } = req.query;

  if (!customerId || !mongoose.isValidObjectId(customerId)) {
    return res.status(400).json({ status: 'error', message: 'customerId is required' });
  }

  const query = { customerId };
  if (status) {
    const allowed = ['open', 'in_progress', 'resolved'];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `status must be one of: ${allowed.join(', ')}`,
      });
    }
    query.status = status;
  }

  // Newest first; resolved ones sink to the bottom of the list.
  const tickets = await Ticket.find(query)
    .sort({ updatedAt: -1 })
    .select('title description status createdAt updatedAt')
    .lean();

  res.json({ tickets });
}
