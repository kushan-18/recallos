import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { customersApi, memoriesApi } from '../api/client.js';
import CustomerNav from '../components/layout/CustomerNav.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';

/**
 * "What the AI remembers about me" — the transparency page.
 *
 * The customer can read every stored memory, correct it, or delete it
 * outright. All three actions send the customerId; the backend refuses
 * anything that isn't theirs (404).
 *
 * Editing re-embeds the text server-side (a Gemini embedding call).
 */
const TYPE_META = {
  issue: { label: 'Issue', className: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  preference: { label: 'Preference', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  fact: { label: 'Fact', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  correction: { label: 'Correction', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
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

export default function MemoriesPage() {
  const { customerId } = useParams();

  const [customer, setCustomer] = useState(null);
  const [memories, setMemories] = useState([]);
  const [retrieval, setRetrieval] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [banner, setBanner] = useState(null); // { kind: 'ok' | 'error', text }

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
    try {
      const data = await memoriesApi.list(customerId);
      setMemories(data.memories || []);
      setRetrieval(data.retrieval || null);
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

  function startEdit(memory) {
    setEditingId(memory._id);
    setDraft(memory.content);
    setConfirmingId(null);
    setBanner(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft('');
  }

  async function saveEdit(memoryId) {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    setBanner(null);
    try {
      const data = await memoriesApi.update(memoryId, customerId, text);
      setMemories((prev) =>
        prev.map((m) =>
          m._id === memoryId
            ? { ...m, content: data.memory.content, updatedAt: data.memory.updatedAt, embedded: data.embedded }
            : m,
        ),
      );
      setEditingId(null);
      setDraft('');
      setBanner({
        kind: 'ok',
        text: data.embedded
          ? 'Memory updated and re-embedded — semantic search now matches the new wording.'
          : 'Memory updated. Re-embedding is pending (AI service busy) — run "npm run embed" to re-index it.',
      });
    } catch (err) {
      setBanner({ kind: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function deleteMemory(memoryId) {
    setSaving(true);
    setBanner(null);
    try {
      await memoriesApi.remove(memoryId, customerId);
      setMemories((prev) => prev.filter((m) => m._id !== memoryId));
      setConfirmingId(null);
      setBanner({ kind: 'ok', 'text': 'Memory deleted — the AI will not use it again.' });
    } catch (err) {
      setBanner({ kind: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <CustomerNav customer={customer} active="memories" />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">What the AI remembers</h2>
          <p className="mt-1 text-sm text-slate-400">
            Memories are extracted automatically from your chats. Correct anything that's
            wrong, or delete it — the AI won't use what you remove.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1">
            {memories.length} memor{memories.length === 1 ? 'y' : 'ies'}
          </span>
          {retrieval && (
            <span
              className={`rounded-full border px-2.5 py-1 ${
                retrieval === 'atlas-vector'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
              title="How memories are searched"
            >
              search: {retrieval}
            </span>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {banner.text}
        </div>
      )}

      {status === 'loading' && <p className="text-sm text-slate-500">Loading memories…</p>}

      {status === 'error' && (
        <ErrorBanner error={error} onRetry={load} />
      )}

      {status === 'success' && memories.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
          Nothing remembered yet — memories appear after you chat with the assistant.
        </div>
      )}

      <ul className="space-y-3">
        {memories.map((memory) => {
          const meta = TYPE_META[memory.type] ?? TYPE_META.fact;
          const isEditing = editingId === memory._id;

          return (
            <li
              key={memory._id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
                  {meta.label}
                </span>
                <span className="text-[11px] text-slate-500">
                  {memory.embedded ? 'searchable' : 'not indexed'}
                </span>
                <span className="ml-auto text-[11px] text-slate-500">
                  updated {formatDate(memory.updatedAt)}
                </span>
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveEdit(memory._id)}
                      disabled={saving || !draft.trim()}
                      className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-40"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <span className="text-[11px] text-slate-500">{draft.length}/500</span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-slate-200">{memory.content}</p>
                  <div className="mt-3 flex gap-3 text-xs">
                    <button
                      onClick={() => startEdit(memory)}
                      className="text-indigo-400 transition hover:text-indigo-300"
                    >
                      ✏️ Edit
                    </button>
                    {confirmingId === memory._id ? (
                      <>
                        <button
                          onClick={() => deleteMemory(memory._id)}
                          disabled={saving}
                          className="font-medium text-red-400 transition hover:text-red-300"
                        >
                          {saving ? 'Deleting…' : 'Yes, delete it'}
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="text-slate-400 transition hover:text-slate-300"
                        >
                          Keep it
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setConfirmingId(memory._id);
                          setBanner(null);
                        }}
                        className="text-slate-500 transition hover:text-red-400"
                      >
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
