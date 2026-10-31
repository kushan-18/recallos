import { NavLink, Link } from 'react-router-dom';

/**
 * The bar on every EMPLOYEE page — amber accent, so the dashboard is
 * visually distinct from the indigo customer side at a glance
 * (important during the demo: you always know which "world" you're in).
 */
export default function EmployeeNav({ active }) {
  const tabs = [
    { key: 'overview', label: 'Overview', icon: '📊', to: '/employee' },
    { key: 'customers', label: 'Customers', icon: '👥', to: '/employee/customers' },
  ];

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-amber-500/20 pb-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-lg ring-1 ring-amber-500/30">
          🛠️
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-100">Employee Dashboard</p>
          <p className="text-xs text-slate-400">All customers · support team view</p>
        </div>
      </div>

      <nav className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/70 p-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              active === tab.key
                ? 'bg-amber-500/15 text-amber-200 shadow ring-1 ring-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Link
        to="/"
        className="text-xs text-slate-500 transition hover:text-slate-300"
        title="Back to the customer-facing app"
      >
        💬 Customer view
      </Link>
    </div>
  );
}

/** Small reusable status chip for conversations/tickets. */
export function StatusChip({ status }) {
  const meta = {
    ai: { label: 'AI handling', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
    human: { label: 'Human takeover', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
    open: { label: 'Open', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
    in_progress: { label: 'In progress', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
    resolved: { label: 'Resolved', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  }[status] ?? { label: status, cls: 'border-slate-600 bg-slate-800 text-slate-300' };

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
