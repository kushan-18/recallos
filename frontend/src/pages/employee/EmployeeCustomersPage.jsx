import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { employeeApi } from '../../api/client.js';
import EmployeeNav from '../../components/layout/EmployeeNav.jsx';

/**
 * /employee/customers — every customer with their stats.
 * Read-only; clicking opens the full profile (memories, tickets, chats).
 */
export default function EmployeeCustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    employeeApi
      .customers()
      .then((d) => {
        if (cancelled) return;
        setCustomers(d.customers);
        setStatus('success');
      })
      .catch((err) => !cancelled && (setError(err.message), setStatus('error')));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <EmployeeNav active="customers" />

      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight">Customers</h2>
        <p className="mt-1 text-sm text-slate-400">
          Open a profile to see everything the AI remembers, their tickets, and their chats.
        </p>
      </div>

      {status === 'loading' && <p className="text-sm text-slate-500">Loading customers…</p>}

      {status === 'error' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}. Is the backend running?
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {customers.map((c) => (
          <li key={c._id}>
            <Link
              to={`/employee/customers/${c._id}`}
              className="block rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-amber-500/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-semibold text-amber-300 ring-1 ring-amber-500/30">
                  {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    {c.email} · {c.plan} plan
                    {c.isDemo ? ' · DEMO DATA' : ''}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5">
                  {c.conversationCount} chats
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5">
                  {c.memoryCount} memories
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 ${
                    c.openTicketCount > 0
                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                      : 'border-slate-700 bg-slate-800'
                  }`}
                >
                  {c.openTicketCount} open tickets
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
