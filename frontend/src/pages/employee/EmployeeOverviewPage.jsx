import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { employeeApi } from '../../api/client.js';
import EmployeeNav, { StatusChip } from '../../components/layout/EmployeeNav.jsx';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * /employee — the dashboard home: the numbers, plus the most recently
 * active conversations across all customers.
 *
 * This page is READ-ONLY and makes no Gemini calls — every employee
 * endpoint here only reads MongoDB.
 */
export default function EmployeeOverviewPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    employeeApi
      .overview()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setStatus('success');
      })
      .catch((err) => !cancelled && (setError(err.message), setStatus('error')));
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = data
    ? [
        { label: 'Customers', value: data.counts.customers, icon: '👥' },
        { label: 'AI conversations', value: data.counts.activeConversations, icon: '🤖' },
        { label: 'Human takeovers', value: data.counts.humanConversations, icon: '🤝' },
        { label: 'Open tickets', value: data.counts.openTickets, icon: '🎫' },
        { label: 'Memories stored', value: data.counts.memories, icon: '🧠' },
      ]
    : [];

  return (
    <div>
      <EmployeeNav active="overview" />

      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight">Support overview</h2>
        <p className="mt-1 text-sm text-slate-400">
          Live counts across all customers, and the latest conversations.
        </p>
      </div>

      {status === 'loading' && <p className="text-sm text-slate-500">Loading overview…</p>}

      {status === 'error' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}. Is the backend running?
        </div>
      )}

      {status === 'success' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div className="text-lg">{card.icon}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">{card.value}</div>
                <div className="mt-0.5 text-xs text-slate-400">{card.label}</div>
              </div>
            ))}
          </div>

          <section className="mt-8">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Recently active conversations
            </h3>
            {data.recentConversations.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-500">
                No conversations yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.recentConversations.map((c) => (
                  <li key={c._id}>
                    <Link
                      to={`/employee/conversations/${c._id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-amber-500/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{c.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {c.customerName} · updated {formatDate(c.updatedAt)}
                        </p>
                      </div>
                      <StatusChip status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
