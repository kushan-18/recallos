import { Router } from 'express';
import { listTickets } from '../controllers/ticket.controller.js';

const router = Router();

// GET /api/tickets?customerId=...&status=open|in_progress|resolved
router.get('/', listTickets);

export default router;
