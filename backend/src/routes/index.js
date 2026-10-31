import { Router } from 'express';
import healthRoutes from './health.routes.js';
import chatRoutes from './chat.routes.js';
import customerRoutes from './customer.routes.js';
import conversationRoutes from './conversation.routes.js';
import memoryRoutes from './memory.routes.js';
import ticketRoutes from './ticket.routes.js';
import employeeRoutes from './employee.routes.js';

const router = Router();

// Every feature gets mounted here, one line per feature.
// CUSTOMER routes (always scoped by customerId):
router.use('/health', healthRoutes);
router.use('/chat', chatRoutes);
router.use('/customers', customerRoutes);
router.use('/conversations', conversationRoutes);
router.use('/memories', memoryRoutes);
router.use('/tickets', ticketRoutes);
// EMPLOYEE route (privileged, separate prefix — see employee.controller.js):
router.use('/employee', employeeRoutes);

export default router;
