import { Router } from 'express';
import { listCustomers, createCustomer, getCustomer } from '../controllers/customer.controller.js';

const router = Router();

// GET  /api/customers     — everyone on the picker
// POST /api/customers     — create a customer (name, email, plan)
// GET  /api/customers/:id — one customer's profile
router.get('/', listCustomers);
router.post('/', createCustomer);
router.get('/:id', getCustomer);

export default router;
