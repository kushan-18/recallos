import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header.jsx';
import CustomerSelectorPage from './pages/CustomerSelectorPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import MemoriesPage from './pages/MemoriesPage.jsx';
import TicketsPage from './pages/TicketsPage.jsx';
import EmployeeOverviewPage from './pages/employee/EmployeeOverviewPage.jsx';
import EmployeeCustomersPage from './pages/employee/EmployeeCustomersPage.jsx';
import EmployeeCustomerProfilePage from './pages/employee/EmployeeCustomerProfilePage.jsx';
import EmployeeConversationPage from './pages/employee/EmployeeConversationPage.jsx';

/**
 * App is the top-level component. It decides which URL shows which page.
 *
 * The customerId lives in the URL of every customer page
 * (e.g. /chat/6ae57...ed3) — that's what keeps requests scoped to one
 * customer, and it's what the backend re-verifies on every call.
 *
 * CUSTOMER routes (scoped, indigo):
 *   /                              -> demo customer picker
 *   /chat/:customerId              -> chat (new conversation)
 *   /chat/:customerId/:conversationId -> one conversation's history
 *   /memories/:customerId          -> what the AI remembers (view/edit/delete)
 *   /tickets/:customerId           -> open/resolved tickets
 *
 * EMPLOYEE routes (privileged, amber — backed by /api/employee/*):
 *   /employee                      -> overview dashboard
 *   /employee/customers            -> customer list with stats
 *   /employee/customers/:customerId-> profile: memories + tickets + history
 *   /employee/conversations/:id    -> thread, AI summary, takeover, replies
 */
export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Header />
        {/* max-w-6xl: the chat page has a sidebar, so it needs more room
            than the old single-column foundation pages. */}
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Routes>
            {/* --- customer --- */}
            <Route path="/" element={<CustomerSelectorPage />} />
            <Route path="/chat/:customerId" element={<ChatPage />} />
            <Route path="/chat/:customerId/:conversationId" element={<ChatPage />} />
            <Route path="/memories/:customerId" element={<MemoriesPage />} />
            <Route path="/tickets/:customerId" element={<TicketsPage />} />
            {/* --- employee (separate prefix, separate API) --- */}
            <Route path="/employee" element={<EmployeeOverviewPage />} />
            <Route path="/employee/customers" element={<EmployeeCustomersPage />} />
            <Route path="/employee/customers/:customerId" element={<EmployeeCustomerProfilePage />} />
            <Route path="/employee/conversations/:conversationId" element={<EmployeeConversationPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
