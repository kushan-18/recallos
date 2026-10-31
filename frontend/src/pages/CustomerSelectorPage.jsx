import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customersApi } from '../api/client.js';

/**
 * The demo customer picker (the app's home page).
 *
 * There is no login system in this demo: you pick WHO you are, and that
 * customer's id then travels in the URL of every page — which is exactly
 * what the backend uses to keep customers strictly separated.
 *
 * Only demo customers are ever offered (the API filters on isDemo).
 */
export default function CustomerSelectorPage() {
  const [customers, setCustomers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    customersApi
      .list()
      .then((data) => {
        if (cancelled) return;
        setCustomers(data.customers);
        setStatus('success');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto max-w-2xl space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Who's chatting today?</h2>
        <p className="mt-2 text-sm text-slate-400">
          Pick a demo customer to open their chat, memories and tickets.
          Each customer's data is kept strictly separate.
        </p>
        <span className="mt-3 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
          DEMO DATA — two sample accounts
        </span>
      </div>

      {status === 'loading' && (
        <p className="text-center text-sm text-slate-400">Loading customers…</p>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}. Is the backend running? Start it with <code>npm run dev</code> inside the
          backend folder.
        </div>
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
      </div>

      {status === 'success' && customers.length === 0 && (
        <p className="text-center text-sm text-slate-400">
          No demo customers found — run <code>npm run seed</code> in the backend folder.
        </p>
      )}
    </section>
  );
}
