import { Router } from 'express';
import { postChat } from '../controllers/chat.controller.js';

const router = Router();

// POST /api/chat  { customerId, conversationId?, message }
router.post('/', postChat);

export default router;
