import { Router } from 'express';
import { listConversations, listMessages } from '../controllers/conversation.controller.js';

const router = Router();

// GET /api/conversations?customerId=...                  — sidebar list
// GET /api/conversations/:id/messages?customerId=...     — one thread
router.get('/', listConversations);
router.get('/:id/messages', listMessages);

export default router;
