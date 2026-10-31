/**
 * customer.controller.js — the demo customer picker API.
 *
 * Demo mode has no login, so the UI asks "who are you?" and then sends
 * that customerId with EVERY request (that is the isolation contract).
 *
 * Only demo customers (isDemo: true) are ever listed, so a real record
 * could never be selected in a live environment.
 */
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';

/** GET /api/customers — the choices shown on the picker screen. */
export async function listCustomers(req, res) {
  const customers = await Customer.find({ isDemo: true })
    .select('name email plan')
    .sort({ name: 1 })
    .lean();

  res.json({ customers });
}

/** GET /api/customers/:id — one customer's profile (for the page header). */
export async function getCustomer(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid customer id' });
  }

  const customer = await Customer.findById(id).select('name email plan isDemo').lean();
  if (!customer) {
    return res.status(404).json({ status: 'error', message: 'Customer not found' });
  }

  res.json({ customer });
}
