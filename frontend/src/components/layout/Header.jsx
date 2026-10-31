import { Link, useLocation } from 'react-router-dom';

/**
 * The top bar of the app. Kept in its own folder (components/layout/)
 * because we'll likely reuse it on every page.
 *
 * NOTE: the product name is temporary ("AI Customer Support") until the
 * team picks a final name — then just change it here and in index.html.
 *
 * The right side links between the two worlds of the demo:
 * customer view (indigo) and the employee dashboard (amber).
 */
export default function Header() {
  const { pathname } = useLocation();
  const onEmployee = pathname.startsWith('/employee');

  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              AI Customer Support
            </h1>
            <p className="text-xs text-slate-400">
              Support that remembers you
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            MongoDB Agentic Memory track
          </span>
          <Link
            to={onEmployee ? '/' : '/employee'}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              onEmployee
                ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
            }`}
            title={onEmployee ? 'Back to the customer view' : 'Open the employee dashboard'}
          >
            {onEmployee ? '💬 Customer view' : '🛠️ Employee'}
          </Link>
        </div>
      </div>
    </header>
  );
}
