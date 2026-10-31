import { Router } from 'express';
import { listMemories, updateMemory, deleteMemory } from '../controllers/memory.controller.js';

const router = Router();

// GET    /api/memories?customerId=...  — what the AI remembers
// PATCH  /api/memories/:id             — correct a memory
// DELETE /api/memories/:id             — forget a memory
router.get('/', listMemories);
router.patch('/:id', updateMemory);
router.delete('/:id', deleteMemory);

export default router;
