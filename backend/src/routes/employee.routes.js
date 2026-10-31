import { Router } from 'express';
import {
  getOverview,
  listAllCustomers,
  getCustomerProfile,
  getConversationThread,
  takeOverConversation,
  handBackToAI,
  sendEmployeeReply,
  updateTicketStatus,
  getConversationSummary,
} from '../controllers/employee.controller.js';

const router = Router();

// The EMPLOYEE dashboard API — clearly separate from the customer routes.
// (In a real product these would sit behind an employee login; see the
//  controller header comment.)

router.get('/overview', getOverview);
router.get('/customers', listAllCustomers);
router.get('/customers/:id', getCustomerProfile);
router.get('/conversations/:id', getConversationThread);
router.get('/conversations/:id/summary', getConversationSummary);
router.post('/conversations/:id/takeover', takeOverConversation);
router.post('/conversations/:id/handback', handBackToAI);
router.post('/conversations/:id/replies', sendEmployeeReply);
router.patch('/tickets/:id', updateTicketStatus);

export default router;
