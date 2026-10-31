/**
 * ============================================================================
 * SEED SCRIPT — creates the labelled demo data for our ISP company "FastNet"
 * ============================================================================
 * Run it with:   npm run seed      (from the backend/ folder)
 *
 * It is SAFE to run repeatedly: it first deletes only the demo records
 * (matched by their demo emails / demo titles), then re-creates them.
 * Your own (non-demo) data is never touched.
 *
 * What it creates:
 *   - 2 demo customers (with isDemo: true)
 *   - Past conversations + messages for each
 *   - 3 support tickets
 *   - 4 memories per customer (text only for now — Phase 2 adds embeddings)
 *   - 6 company knowledge articles (FAQs / policies)
 * ============================================================================
 */
import mongoose from 'mongoose';
import env from '../config/env.js';
import { connectDB } from '../config/db.js';
import Customer from '../models/Customer.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Memory from '../models/Memory.js';
import Ticket from '../models/Ticket.js';
import Knowledge from '../models/Knowledge.js';

async function seed() {
  if (!env.mongodbUri || env.mongodbUri.startsWith('your-')) {
    console.error('ERROR: MONGODB_URI is not set in backend/.env — cannot seed.');
    process.exit(1);
  }

  await connectDB();
  console.log('Connected to MongoDB. Seeding demo data...\n');

  // ---------------------------------------------------------------------
  // 1. Clean up ONLY previous demo data (idempotent = safe to re-run)
  // ---------------------------------------------------------------------

  // 1a. Remove any customers created via the "New customer" picker form
  //     (isDemo: false) — demo:reset keeps only the seeded accounts.
  const formCustomers = await Customer.find({ isDemo: false });
  if (formCustomers.length > 0) {
    const formIds = formCustomers.map((c) => c._id);
    const formConvIds = await Conversation.find({ customerId: { $in: formIds } }).distinct('_id');
    await Message.deleteMany({ conversationId: { $in: formConvIds } });
    await Conversation.deleteMany({ customerId: { $in: formIds } });
    await Memory.deleteMany({ customerId: { $in: formIds } });
    await Ticket.deleteMany({ customerId: { $in: formIds } });
    await Customer.deleteMany({ _id: { $in: formIds } });
    console.log(`✓ removed ${formCustomers.length} form-created customer(s) and their data`);
  }

  // 1b. Remove previous seeded demo customers, then re-create them fresh.
  const demoEmails = ['alice.demo@fastnet.example', 'bob.demo@fastnet.example'];
  const oldDemoCustomers = await Customer.find({ email: { $in: demoEmails } });
  const oldDemoIds = oldDemoCustomers.map((c) => c._id);

  if (oldDemoIds.length > 0) {
    // Delete messages BEFORE their conversations (order matters).
    const oldConvIds = await Conversation.find({ customerId: { $in: oldDemoIds } }).distinct('_id');
    await Message.deleteMany({ conversationId: { $in: oldConvIds } });
    await Conversation.deleteMany({ customerId: { $in: oldDemoIds } });
    await Memory.deleteMany({ customerId: { $in: oldDemoIds } });
    await Ticket.deleteMany({ customerId: { $in: oldDemoIds } });
  }
  await Customer.deleteMany({ email: { $in: demoEmails } });
  // Demo knowledge articles (recognised by their "[DEMO]" title prefix)
  await Knowledge.deleteMany({ title: /^\[DEMO\]/ });

  // ---------------------------------------------------------------------
  // 2. Demo customers
  // ---------------------------------------------------------------------
  const alice = await Customer.create({
    name: 'Alice Johnson',
    email: 'alice.demo@fastnet.example',
    plan: 'Premium',
    isDemo: true,
  });
  const bob = await Customer.create({
    name: 'Bob Smith',
    email: 'bob.demo@fastnet.example',
    plan: 'Basic',
    isDemo: true,
  });
  console.log('✓ 2 demo customers created (Alice Johnson, Bob Smith)');

  // ---------------------------------------------------------------------
  // 3. Past conversations + messages (this is the history the AI will
  //    remember in later conversations)
  // ---------------------------------------------------------------------
  const aliceConv1 = await Conversation.create({
    customerId: alice._id,
    title: 'Internet keeps dropping',
    status: 'ai',
  });
  await Message.insertMany([
    { conversationId: aliceConv1._id, role: 'customer', content: 'Hi, my internet keeps dropping out every evening.' },
    { conversationId: aliceConv1._id, role: 'ai', content: 'I am sorry to hear that. Can you tell me your router model so I can help?' },
    { conversationId: aliceConv1._id, role: 'customer', content: 'It is the XR-200 that FastNet sent me. It only happens in the evenings.' },
    { conversationId: aliceConv1._id, role: 'ai', content: 'Thank you. Evening-only drops are often a firmware issue. I have noted your router model and the evening pattern for you.' },
  ]);

  const aliceConv2 = await Conversation.create({
    customerId: alice._id,
    title: 'Billing question',
    status: 'ai',
  });
  await Message.insertMany([
    { conversationId: aliceConv2._id, role: 'customer', content: 'Also, I was charged twice this month.' },
    { conversationId: aliceConv2._id, role: 'ai', content: 'I understand. I have created a billing ticket for you. Our team will review the double charge.' },
  ]);

  const bobConv1 = await Conversation.create({
    customerId: bob._id,
    title: 'Slow speeds after signup',
    status: 'ai',
  });
  await Message.insertMany([
    { conversationId: bobConv1._id, role: 'customer', content: 'I signed up last week and the speeds are much slower than advertised.' },
    { conversationId: bobConv1._id, role: 'ai', content: 'I can help with that. Could you share the speed test result?' },
    { conversationId: bobConv1._id, role: 'customer', content: 'About 12 Mbps, I pay for 50 Mbps. I work from home so this is urgent.' },
  ]);
  console.log('✓ 3 demo conversations with messages created');

  // ---------------------------------------------------------------------
  // 4. Support tickets
  // ---------------------------------------------------------------------
  await Ticket.insertMany([
    {
      customerId: alice._id,
      title: 'Double charge on October bill',
      description: 'Customer reports being billed twice for the same month.',
      status: 'open',
    },
    {
      customerId: alice._id,
      title: 'Evening disconnections (XR-200)',
      description: 'Router drops every evening. Firmware suspected.',
      status: 'in_progress',
    },
    {
      customerId: bob._id,
      title: 'Speeds below plan (12 of 50 Mbps)',
      description: 'Customer works from home; escalation priority.',
      status: 'open',
    },
  ]);
  console.log('✓ 3 demo tickets created');

  // ---------------------------------------------------------------------
  // 5. Customer memories (Phase 2 will attach embedding vectors to these)
  // ---------------------------------------------------------------------
  await Memory.insertMany([
    { customerId: alice._id, type: 'issue', content: 'Router model XR-200 keeps disconnecting, usually in the evenings.', sourceConversationId: aliceConv1._id },
    { customerId: alice._id, type: 'issue', content: 'Was double-charged on the October bill; billing ticket opened.', sourceConversationId: aliceConv2._id },
    { customerId: alice._id, type: 'preference', content: 'Prefers concise answers and evening callbacks.', sourceConversationId: aliceConv1._id },
    { customerId: alice._id, type: 'fact', content: 'On the Premium plan.', sourceConversationId: null },
    { customerId: bob._id, type: 'issue', content: 'Receiving 12 Mbps instead of the paid 50 Mbps plan.', sourceConversationId: bobConv1._id },
    { customerId: bob._id, type: 'fact', content: 'Works from home, so reliability is critical.', sourceConversationId: bobConv1._id },
    { customerId: bob._id, type: 'preference', content: 'Wants urgent handling of speed issues.', sourceConversationId: bobConv1._id },
    { customerId: bob._id, type: 'fact', content: 'On the Basic plan, signed up last week.', sourceConversationId: null },
  ]);
  console.log('✓ 8 demo memories created (embeddings are added by Phase 2)');

  // ---------------------------------------------------------------------
  // 6. Company knowledge base (FAQs / policies — separate from memories)
  // ---------------------------------------------------------------------
  await Knowledge.insertMany([
    { title: '[DEMO] Refund policy', category: 'billing', content: 'Refunds for double charges are processed within 5–7 business days after the billing team confirms the duplicate payment.' },
    { title: '[DEMO] Router troubleshooting', category: 'troubleshooting', content: 'For intermittent disconnections: restart the router, check firmware version, and inspect the coaxial/splitter. Evening-only issues often point to network congestion or overheating.' },
    { title: '[DEMO] Firmware updates', category: 'troubleshooting', content: 'FastNet pushes router firmware updates automatically at night. Customers can force an update from the router admin page at 192.168.0.1.' },
    { title: '[DEMO] Speed guarantees', category: 'billing', content: 'Advertised speeds are "up to" the plan maximum. Sustained speeds below 50% of the plan for 3+ days qualify for a technician visit.' },
    { title: '[DEMO] Warranty and replacements', category: 'support', content: 'FastNet routers are covered by a 12-month warranty. Faulty routers are replaced free of charge within the warranty period.' },
    { title: '[DEMO] Escalation process', category: 'support', content: 'Unresolved issues after 48 hours are escalated to a senior technician. Customers working from home are prioritised.' },
  ]);
  console.log('✓ 6 demo knowledge articles created');

  console.log('\nSeeding complete.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
