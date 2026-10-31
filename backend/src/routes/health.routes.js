import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';

const router = Router();

// A controller holds the actual logic for a request.
// The route file's only job is to map a URL + method to a controller.
// GET /api/health -> getHealth
router.get('/', getHealth);

export default router;
