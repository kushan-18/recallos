import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { conversationsApi, customersApi, chatApi } from '../api/client.js';
import CustomerNav from '../components/layout/CustomerNav.jsx';

/**
 * The customer chat page.
 *
 * Layout: conversation sidebar (left) | active conversation (right).
 *
 * Every request carries the customerId from the URL, so this customer can
 * only ever see their own conversations — the backend re-verifies it.
 *
 * Selecting a conversation in the sidebar only READS history from
 * MongoDB. Sending a message is the one action that reaches Gemini.
 */
export default function ChatPage() {
  const { customerId, conversationId } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState({ sidebar: true, thread: false });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const threadRef = useRef(null);

  /* --- customer profile (for the header) --- */
  useEffect(() => {
    let cancelled = false;
    setCustomer(null);
    customersApi
      .get(customerId)
      .then((data) => !cancelled && setCustomer(data.customer))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  /* --- sidebar: this customer's conversations --- */
  const loadConversations = useCallback(async () => {
    setLoading((s) => ({ ...s, sidebar: true }));
    try {
      const data = await conversationsApi.list(customerId);
      setConversations(data.conversations || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading((s) => ({ ...s, sidebar: false }));
    }
  }, [customerId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  /* --- thread: one conversation's history --- */
  useEffect(() => {
    let cancelled = false;

    if (!conversationId) {
      setActiveConversation(null);
      setMessages([]);
      return () => {
        cancelled = true;
      };
    }

    // Clear the previous conversation immediately so its status (e.g. a
    // human take-over) can never leak into the one we're about to open.
    setActiveConversation(null);
    setLoading((s) => ({ ...s, thread: true }));
    conversationsApi
      .messages(customerId, conversationId)
      .then((data) => {
        if (cancelled) return;
        setActiveConversation(data.conversation || null);
        setMessages(data.messages || []);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading((s) => ({ ...s, thread: false })));

    return () => {
      cancelled = true;
    };
  }, [customerId, conversationId]);

  /* --- keep the newest message in view --- */
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading.thread]);

  /* --- send: the one Gemini-backed action --- */
  async function sendMessage(text) {
    if (!text || sending) return;

    setSending(true);
    setNotice(null);
    setError(null);

    // Optimistic: show the customer's line immediately.
    setMessages((prev) => [...prev, { role: 'customer', content: text }]);
    setDraft('');

    try {
      const data = await chatApi.send({ customerId, conversationId, message: text });

      // First message of a conversation -> server created it: update the URL.
      if (!conversationId && data.conversationId) {
        navigate(`/chat/${customerId}/${data.conversationId}`, { replace: true });
      }

      // Rebuild the thread from the server's reply + refresh sidebar previews.
      setMessages((prev) => [...prev, { role: 'ai', content: data.reply }]);
      setNotice({
        mode: data.retrieval?.mode,
        memories: data.retrieval?.memoriesUsed ?? [],
        saved: [
          ...(data.memoryUpdates?.created ?? []),
          ...(data.memoryUpdates?.updated ?? []),
        ],
      });
      loadConversations();
    } catch (err) {
      // Remove the optimistic line so history and screen never disagree.
      setMessages((prev) => prev.slice(0, -1));
      // Clear, actionable message: timeout / quota / server down.
      setError(err.message);
      setDraft(text); // give the customer their text back so they can retry
    } finally {
      setSending(false);
    }
  }

  function handleSend(e) {
    e.preventDefault();
    sendMessage(draft.trim());
  }

  /**
   * The input stays ENABLED unless a human agent has taken over the
   * conversation currently on screen. In particular, with no conversation
   * selected (a brand-new chat) it is always enabled — the first send
   * creates the conversation on the server.
   */
  const humanTookOver = activeConversation?.status === 'human';
  const canSend = !humanTookOver;

  return (
    <div className="space-y-0">
      <CustomerNav customer={customer} active="chat" />

      <div className="flex min-h-[60vh] overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
        {/* ---------------- sidebar ---------------- */}
        <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Conversations
            </span>
            <button
              onClick={() => navigate(`/chat/${customerId}`)}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-indigo-500/60 hover:text-indigo-300"
              title="Start a new conversation"
            >
              ＋ New
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {loading.sidebar && <p className="px-2 py-3 text-xs text-slate-500">Loading…</p>}

            {!loading.sidebar && conversations.length === 0 && (
              <p className="px-2 py-3 text-xs text-slate-500">
                No conversations yet. Say hello below.
              </p>
            )}

            {conversations.map((c) => {
              const isActive = c._id === conversationId;
              return (
                <button
                  key={c._id}
                  onClick={() => navigate(`/chat/${customerId}/${c._id}`)}
                  className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition ${
                    isActive
                      ? 'bg-indigo-500/15 ring-1 ring-indigo-500/40'
                      : 'hover:bg-slate-800/60'
                  }`}
                >
                  <p className="truncate text-sm text-slate-200">{c.title}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {c.lastMessage ?? '—'} · {c.messageCount} msg
                    {c.status === 'human' ? ' · 👤 human' : ''}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ---------------- thread ---------------- */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div ref={threadRef} className="flex-1 space-y-4 overflow-y-auto p-5">
            {!conversationId && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="text-3xl">💬</span>
                <p className="mt-3 text-sm font-medium text-slate-200">
                  Start a new conversation
                </p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  The AI already remembers this customer's history from earlier chats —
                  ask it something and watch it recall the details.
                </p>
              </div>
            )}

            {loading.thread && (
              <p className="text-sm text-slate-500">Loading conversation…</p>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'customer'
                      ? 'bg-indigo-500/90 text-white'
                      : 'bg-slate-800 text-slate-100'
                  }`}
                >
                  {m.role !== 'customer' && (
                    <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
                      {m.role === 'employee' ? 'Human agent' : 'AI assistant'}
                    </span>
                  )}
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-slate-800 px-4 py-2.5 text-sm text-slate-400">
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {/* --- retrieval transparency (what the AI used/saved) --- */}
          {notice && (
            <div className="border-t border-slate-800 bg-slate-950/50 px-5 py-3 text-xs text-slate-400">
              <span className="mr-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                {notice.mode}
              </span>
              {notice.memories.length > 0 && (
                <span className="mr-3">
                  used {notice.memories.length} memor{notice.memories.length === 1 ? 'y' : 'ies'}
                </span>
              )}
              {notice.saved.length > 0 && (
                <span>
                  saved: {notice.saved.map((m) => m.content.slice(0, 50)).join(' · ')}
                </span>
              )}
              {notice.memories.length === 0 && notice.saved.length === 0 && (
                <span>No memories used or saved for this message.</span>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between gap-3 border-t border-red-500/30 bg-red-500/10 px-5 py-3 text-xs text-red-300">
              <span>⚠️ {error}</span>
              <button
                type="button"
                onClick={() => {
                  if (draft.trim()) {
                    sendMessage(draft.trim());
                  } else {
                    loadConversations();
                  }
                }}
                disabled={sending}
                className="shrink-0 rounded-md border border-red-400/40 px-3 py-1 font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                title={draft.trim() ? 'Your message is still in the box — send it again' : 'Reload conversations'}
              >
                ↻ Retry
              </button>
            </div>
          )}

          {/* ---------------- composer ---------------- */}
          <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-800 p-4">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canSend || sending}
              placeholder={
                !canSend
                  ? 'A human agent has taken over this conversation'
                  : !conversationId
                    ? 'Type your message — the first one starts a new conversation…'
                    : 'Type your message…'
              }
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!canSend || sending || !draft.trim()}
              className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? '…' : 'Send'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

