import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { customersApi, ticketsApi } from '../api/client.js';
import CustomerNav from '../components/layout/CustomerNav.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';

/**
 * The customer's support tickets, split into "Open" and "Resolved".
 * Read-only: changing a ticket's status is the employee's job (Phase 4).
 *
 * Scoped by customerId in the URL — the backend refuses anyone else's id.
 */
const STATUS_META = {
  open: { label: 'Open', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  in_progress: { label: 'In progress', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  resolved: { label: 'Resolved', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
};

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TicketsPage() {
  const { customerId } = useParams();

  const [customer, setCustomer] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    customersApi
      .get(customerId)
      .then((data) => !cancelled && setCustomer(data.customer))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await ticketsApi.list(customerId);
      setTickets(data.tickets || []);
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const open = tickets.filter((t) => t.status !== 'resolved');
  const resolved = tickets.filter((t) => t.status === 'resolved');

  function renderGroup(title, items, emptyText) {
    return (
      <section className="mb-8">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
          {title}
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-normal text-slate-300">
            {items.length}
          </span>
        </h3>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">
            {emptyText}
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((ticket) => {
              const meta = STATUS_META[ticket.status] ?? STATUS_META.open;
              return (
                <li
                  key={ticket._id}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      opened {formatDate(ticket.createdAt)}
                    </span>
                    {ticket.updatedAt !== ticket.createdAt && (
                      <span className="text-[11px] text-slate-500">
                        · updated {formatDate(ticket.updatedAt)}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-100">{ticket.title}</p>
                  {ticket.description && (
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      {ticket.description}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div>
      <CustomerNav customer={customer} active="tickets" />

      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight">Your support tickets</h2>
        <p className="mt-1 text-sm text-slate-400">
          Everything raised on this account, and where each one stands.
        </p>
      </div>

      {status === 'loading' && <p className="text-sm text-slate-500">Loading tickets…</p>}

      {status === 'error' && (
        <ErrorBanner error={error} onRetry={load} />
      )}

      {status === 'success' && (
        <>
          {renderGroup('Open', open, 'No open tickets — nothing needs attention right now.')}
          {renderGroup('Resolved', resolved, 'No resolved tickets yet.')}
        </>
      )}
    </div>
  );
}
