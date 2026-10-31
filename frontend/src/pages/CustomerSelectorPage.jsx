import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { customersApi } from '../api/client.js';
import ErrorBanner from '../components/ErrorBanner.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The demo customer picker (the app's home page).
 *
 * There is no login system in this demo: you pick WHO you are, and that
 * customer's id then travels in the URL of every page — which is exactly
 * what the backend uses to keep customers strictly separated.
 *
 * You can also create a new demo customer on the spot (zero memories,
 * fresh chat). These accounts are removed by `npm run demo:reset`.
 */
export default function CustomerSelectorPage() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  // --- new-customer form state ---
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPlan, setFormPlan] = useState('Basic');
  const [formError, setFormError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await customersApi.list();
      // Default to [] so an unexpected response shape never crashes .map()
      setCustomers(data.customers || []);
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError(null);

    // Client-side validation (the backend re-checks everything).
    if (!formName.trim()) {
      setFormError('Please enter a name.');
      return;
    }
    if (!formEmail.trim() || !EMAIL_RE.test(formEmail.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setCreating(true);
    try {
      const data = await customersApi.create({
        name: formName.trim(),
        email: formEmail.trim(),
        plan: formPlan,
      });
      navigate(`/chat/${data.customer._id}`);
    } catch (err) {
      setFormError(err.message);
      setCreating(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Who's chatting today?</h2>
        <p className="mt-2 text-sm text-slate-400">
          Pick a demo customer to open their chat, memories and tickets.
          Each customer's data is kept strictly separate.
        </p>
        <span className="mt-3 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
          DEMO DATA — sample accounts, or create your own below
        </span>
      </div>

      {status === 'loading' && (
        <p className="text-center text-sm text-slate-400">Loading customers…</p>
      )}

      {status === 'error' && (
        <ErrorBanner
          error={`${error}. Is the backend running? Start it with "npm run dev" in the backend folder.`}
          onRetry={load}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {customers.map((customer) => (
          <Link
            key={customer._id}
            to={`/chat/${customer._id}`}
            className="group rounded-xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-indigo-500/50 hover:bg-slate-900"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
                {customer.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')}
              </div>
              <div>
                <p className="font-medium text-slate-100 group-hover:text-white">
                  {customer.name}
                </p>
                <p className="text-xs text-slate-400">{customer.email}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                {customer.plan} plan
              </span>
              <span className="text-xs text-indigo-400 transition group-hover:text-indigo-300">
                Open chat →
              </span>
            </div>
          </Link>
        ))}

        {/* ---------- new-customer form card ---------- */}
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-lg">
              ➕
            </div>
            <div>
              <p className="font-medium text-slate-200">New customer</p>
              <p className="text-xs text-slate-500">
                Demo only — no real authentication
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Name"
              disabled={creating}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500/60"
            />
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="Email"
              disabled={creating}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500/60"
            />
            <select
              value={formPlan}
              onChange={(e) => setFormPlan(e.target.value)}
              disabled={creating}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
            >
              <option value="Basic">Basic plan</option>
              <option value="Premium">Premium plan</option>
            </select>

            {formError && (
              <p className="text-xs text-red-400">⚠️ {formError}</p>
            )}

            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create & open chat →'}
            </button>
          </div>
        </form>
      </div>

      {status === 'success' && customers.length === 0 && (
        <p className="text-center text-sm text-slate-400">
          No customers found — run <code>npm run seed</code> in the backend folder.
        </p>
      )}
    </section>
  );
}
