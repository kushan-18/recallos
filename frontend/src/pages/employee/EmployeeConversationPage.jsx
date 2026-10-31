import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { employeeApi } from '../../api/client.js';
import EmployeeNav, { StatusChip } from '../../components/layout/EmployeeNav.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';

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
 * /employee/conversations/:id — one conversation, full history, plus the
 * three employee actions:
 *
 *   1. AI SUMMARY  — button-triggered ONLY (never on page load), so browsing
 *                    the dashboard never burns Gemini quota. The first click
 *                    generates and the server caches it; later visits show
 *                    the cached text. "Regenerate" = 1 more AI call.
 *   2. TAKEOVER    — bot stops answering this chat (customer's input locks);
 *                    hand it back any time.
 *   3. REPLY       — employee messages, only possible while in takeover mode.
 *
 * Takeover/reply are pure MongoDB writes — zero AI calls.
 */
export default function EmployeeConversationPage() {
  const { conversationId } = useParams();

  const [data, setData] = useState(null); // { conversation, customer, messages }
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [summary, setSummary] = useState(null); // { summary, generated, summaryAt }
  const [summaryState, setSummaryState] = useState('idle'); // idle | loading | error
  const [summaryError, setSummaryError] = useState(null);

  const [replyDraft, setReplyDraft] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState(null); // { kind, text }

  const threadRef = useRef(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const d = await employeeApi.conversation(conversationId);
      const conversation = d.conversation || {};
      setData({
        ...d,
        conversation,
        customer: d.customer || {},
        messages: d.messages || [],
      });
      // The thread response carries any cached summary — no AI call needed.
      setSummary(conversation.summary ? { summary: conversation.summary, summaryAt: conversation.summaryAt } : null);
      setError(null);
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages, sendingReply]);

  const isHuman = data?.conversation?.status === 'human';

  /* --- 1. AI summary (explicit click = the only Gemini action here) --- */
  async function handleSummary(regenerate) {
    setSummaryState('loading');
    setSummaryError(null);
    try {
      const d = await employeeApi.summary(conversationId, regenerate);
      setSummary(d);
      setSummaryState('idle');
    } catch (err) {
      setSummaryError(err.message);
      setSummaryState('error');
    }
  }

  /* --- 2. takeover / hand back --- */
  async function setHandling(mode) {
    setTakeoverBusy(true);
    setActionNotice(null);
    try {
      const d = mode === 'human' ? await employeeApi.takeover(conversationId) : await employeeApi.handback(conversationId);
      setData((prev) => ({ ...prev, conversation: { ...prev.conversation, status: d.conversation.status } }));
      setActionNotice(
        mode === 'human'
          ? { kind: 'ok', text: 'You have taken over — the AI will not answer this chat. You can reply below.' }
          : { kind: 'ok', text: 'Handed back to the AI — the bot will answer the next message.' },
      );
    } catch (err) {
      setActionNotice({ kind: 'error', text: err.message });
    } finally {
      setTakeoverBusy(false);
    }
  }

  /* --- 3. employee reply (pure MongoDB, no AI) --- */
  async function sendReply(e) {
    e.preventDefault();
    const text = replyDraft.trim();
    if (!text || sendingReply) return;

    setSendingReply(true);
    setActionNotice(null);
    try {
      const d = await employeeApi.reply(conversationId, text);
      setData((prev) => ({
        ...prev,
        messages: [...prev.messages, { ...d.message, createdAt: d.message.createdAt ?? new Date().toISOString() }],
      }));
      setReplyDraft('');
    } catch (err) {
      setActionNotice({ kind: 'error', text: err.message });
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <div>
      <EmployeeNav active="customers" />

      {status === 'loading' && <p className="text-sm text-slate-500">Loading conversation…</p>}

      {status === 'error' && (
        <ErrorBanner error={error} onRetry={load} />
      )}

      {status === 'success' && data && (
        <>
          {/* ---------- header ---------- */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">
                <Link to={`/employee/customers/${data.conversation.customerId}`} className="hover:text-amber-300">
                  ← {data.customer.name}
                </Link>{' '}
                · {data.customer.plan} plan
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">
                {data.conversation.title}
              </h2>
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                <StatusChip status={data.conversation.status} />
                {data.messages.length} messages · updated {formatDate(data.conversation.updatedAt)}
              </p>
            </div>

            {/* takeover / hand back */}
            <div className="flex gap-2">
              {!isHuman ? (
                <button
                  onClick={() => setHandling('human')}
                  disabled={takeoverBusy}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-amber-400 disabled:opacity-40"
                >
                  🤝 Take over
                </button>
              ) : (
                <button
                  onClick={() => setHandling('ai')}
                  disabled={takeoverBusy}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  ↩ Hand back to AI
                </button>
              )}
            </div>
          </div>

          {actionNotice && (
            <div
              className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${
                actionNotice.kind === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {actionNotice.text}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            {/* ---------- thread ---------- */}
            <section className="flex min-h-[50vh] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
              <div ref={threadRef} className="flex-1 space-y-4 overflow-y-auto p-5">
                {data.messages.length === 0 && (
                  <p className="text-sm text-slate-500">This conversation has no messages yet.</p>
                )}
                {data.messages.map((m, i) => (
                  <div
                    key={m._id ?? i}
                    className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        m.role === 'customer'
                          ? 'bg-slate-700 text-slate-100'
                          : m.role === 'employee'
                            ? 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/30'
                            : 'bg-indigo-500/15 text-slate-100 ring-1 ring-indigo-500/30'
                      }`}
                    >
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
                        {m.role === 'customer'
                          ? data.customer.name
                          : m.role === 'employee'
                            ? 'You (human agent)'
                            : 'AI assistant'}
                        {m.createdAt ? ` · ${formatDate(m.createdAt)}` : ''}
                      </span>
                      {m.content}
                    </div>
                  </div>
                ))}

                {sendingReply && (
                  <div className="flex justify-end">
                    <div className="rounded-2xl bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">Sending…</div>
                  </div>
                )}
              </div>

              {/* reply composer — only while in takeover mode */}
              <form onSubmit={sendReply} className="border-t border-slate-800 p-4">
                <div className="flex gap-2">
                  <input
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    disabled={!isHuman || sendingReply}
                    placeholder={
                      isHuman
                        ? 'Reply as a human agent…'
                        : 'Take over the conversation to reply as a human'
                    }
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!isHuman || sendingReply || !replyDraft.trim()}
                    className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sendingReply ? '…' : 'Send'}
                  </button>
                </div>
              </form>
            </section>

            {/* ---------- side panel: AI summary ---------- */}
            <aside className="h-fit rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                📝 AI conversation summary
              </h3>

              {summary ? (
                <div className="mt-3">
                  <p className="text-sm leading-relaxed text-slate-200">{summary.summary}</p>
                  {summary.summaryAt && (
                    <p className="mt-2 text-[11px] text-slate-500">generated {formatDate(summary.summaryAt)}</p>
                  )}
                  <button
                    onClick={() => handleSummary(true)}
                    disabled={summaryState === 'loading'}
                    className="mt-3 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-amber-500/60 hover:text-amber-300 disabled:opacity-40"
                  >
                    {summaryState === 'loading' ? 'Generating…' : '↻ Regenerate'}
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-xs leading-relaxed text-slate-500">
                    Not generated yet. One click costs 1 AI call — the result is cached afterwards,
                    so browsing never repeats it.
                  </p>
                  <button
                    onClick={() => handleSummary(false)}
                    disabled={summaryState === 'loading'}
                    className="mt-3 w-full rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-40"
                  >
                    {summaryState === 'loading' ? 'Generating…' : '✨ Generate summary'}
                  </button>
                </div>
              )}

              {summaryState === 'error' && (
                <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                  {summaryError}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
