import { Router } from 'express';
import { listCustomers, getCustomer } from '../controllers/customer.controller.js';

const router = Router();

// GET /api/customers          — demo customers for the picker
// GET /api/customers/:id      — one customer's profile
router.get('/', listCustomers);
router.get('/:id', getCustomer);

export default router;
