/**
 * customer.controller.js — the demo customer picker API.
 *
 * Demo mode has no login, so the UI asks "who are you?" and then sends
 * that customerId with EVERY request (that is the isolation contract).
 *
 * Two kinds of customers exist:
 *   - seeded demo accounts (isDemo: true)  — Alice & Bob, recreated by demo:reset
 *   - form-created accounts (isDemo: false) — created live via POST /api/customers,
 *     removed by demo:reset
 *
 * All customers are listed in the picker (this is a demo — no real auth).
 */
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';

const ALLOWED_PLANS = ['Basic', 'Premium'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET /api/customers — everyone shown on the picker screen. */
export async function listCustomers(req, res) {
  const customers = await Customer.find({})
    .select('name email plan isDemo')
    .sort({ name: 1 })
    .lean();

  res.json({ customers });
}

/**
 * POST /api/customers — create a customer from the picker's "New customer"
 * form. The account starts with zero memories, tickets and conversations.
 *
 * Validates: name required, email required + valid format, no duplicates.
 * The email is stored lowercased so "Alice@x.com" and "alice@x.com" collide.
 */
export async function createCustomer(req, res) {
  const { name, email, plan } = req.body || {};

  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPlan = ALLOWED_PLANS.includes(plan) ? plan : 'Basic';

  if (!cleanName) {
    return res.status(400).json({ status: 'error', message: 'Name is required.' });
  }
  if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ status: 'error', message: 'A valid email address is required.' });
  }

  // Duplicate check (the schema also has a unique index as a safety net).
  const existing = await Customer.findOne({ email: cleanEmail }).lean();
  if (existing) {
    return res
      .status(409)
      .json({ status: 'error', message: 'A customer with this email already exists.' });
  }

  const customer = await Customer.create({
    name: cleanName,
    email: cleanEmail,
    plan: cleanPlan,
    isDemo: false, // form-created — demo:reset will remove it
  });

  res.status(201).json({
    customer: {
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      plan: customer.plan,
    },
  });
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
