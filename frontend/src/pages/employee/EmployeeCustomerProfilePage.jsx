import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { employeeApi } from '../../api/client.js';
import EmployeeNav, { StatusChip } from '../../components/layout/EmployeeNav.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';

/**
 * /employee/customers/:id — the customer profile:
 *   - what the AI remembers (read-only here; the CUSTOMER edits their own)
 *   - tickets with a status dropdown (the one write on this page)
 *   - conversation history with previews
 */
const TYPE_META = {
  issue: { label: 'Issue', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  preference: { label: 'Preference', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  fact: { label: 'Fact', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  correction: { label: 'Correction', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
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

export default function EmployeeCustomerProfilePage() {
  const { customerId } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [ticketNotice, setTicketNotice] = useState(null); // { kind, text }

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const d = await employeeApi.customer(customerId);
      setData({
        ...d,
        customer: d.customer || {},
        memories: d.memories || [],
        tickets: d.tickets || [],
        conversations: d.conversations || [],
      });
      setError(null);
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Change a ticket's status immediately (PATCH, no AI involved). */
  async function changeTicketStatus(ticketId, newStatus) {
    setTicketNotice(null);
    try {
      const d = await employeeApi.updateTicket(ticketId, newStatus);
      setData((prev) => ({
        ...prev,
        tickets: prev.tickets.map((t) => (t._id === ticketId ? { ...t, status: d.ticket.status } : t)),
      }));
      setTicketNotice({ kind: 'ok', text: `Ticket marked as ${newStatus.replace('_', ' ')}.` });
    } catch (err) {
      setTicketNotice({ kind: 'error', text: err.message });
    }
  }

  return (
    <div>
      <EmployeeNav active="customers" />

      {status === 'loading' && <p className="text-sm text-slate-500">Loading profile…</p>}

      {status === 'error' && (
        <ErrorBanner error={error} onRetry={load} />
      )}

      {status === 'success' && data && (
        <>
          {/* ---------- profile header ---------- */}
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-lg font-semibold text-amber-300 ring-1 ring-amber-500/30">
              {data.customer.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {data.customer.name}
                <span className="ml-3 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-normal text-slate-300">
                  {data.customer.plan} plan
                </span>
                {data.customer.isDemo && (
                  <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-normal text-amber-300">
                    DEMO DATA
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-sm text-slate-400">{data.customer.email}</p>
            </div>
          </div>

          {ticketNotice && (
            <div
              className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${
                ticketNotice.kind === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {ticketNotice.text}
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-2">
            {/* ---------- memories ---------- */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
                🧠 What the AI remembers
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-normal text-slate-300">
                  {data.memories.length}
                </span>
              </h3>
              {data.memories.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">
                  Nothing remembered yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.memories.map((m) => {
                    const meta = TYPE_META[m.type] ?? TYPE_META.fact;
                    return (
                      <li key={m._id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                            {meta.label}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {m.embedded ? 'searchable' : 'not indexed'}
                          </span>
                          <span className="ml-auto text-[11px] text-slate-500">{formatDate(m.updatedAt)}</span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-200">{m.content}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ---------- tickets ---------- */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
                🎫 Tickets
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-normal text-slate-300">
                  {data.tickets.length}
                </span>
              </h3>
              {data.tickets.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">
                  No tickets for this customer.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.tickets.map((t) => (
                    <li key={t._id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-100">{t.title}</p>
                        <select
                          value={t.status}
                          onChange={(e) => changeTicketStatus(t._id, e.target.value)}
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                          title="Change ticket status"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                      {t.description && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">{t.description}</p>
                      )}
                      <p className="mt-1.5 text-[11px] text-slate-500">opened {formatDate(t.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ---------- conversations ---------- */}
          <section className="mt-8">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
              💬 Conversations
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-normal text-slate-300">
                {data.conversations.length}
              </span>
            </h3>
            {data.conversations.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">
                No conversations yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.conversations.map((c) => (
                  <li key={c._id}>
                    <Link
                      to={`/employee/conversations/${c._id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-amber-500/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{c.title}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {c.lastMessage ?? '—'} · {c.messageCount} msg · {formatDate(c.updatedAt)}
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
