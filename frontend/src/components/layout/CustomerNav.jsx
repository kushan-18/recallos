import { NavLink, useParams, Link } from 'react-router-dom';

/**
 * The bar shown on every customer page. It keeps the customerId in the
 * URL, so every page and every request stays tied to one customer.
 *
 * (Demo mode has no login — identity comes from the picker on `/`.
 *  "Switch customer" sends the user back to that picker.)
 */
export default function CustomerNav({ customer, active }) {
  const { customerId } = useParams();

  const tabs = [
    { key: 'chat', label: 'Chat', icon: '💬', to: `/chat/${customerId}` },
    { key: 'memories', label: 'Memories', icon: '🧠', to: `/memories/${customerId}` },
    { key: 'tickets', label: 'Tickets', icon: '🎫', to: `/tickets/${customerId}` },
  ];

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
      <div className="flex items-center gap-3">
        {/* Initials avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
          {customer
            ? customer.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
            : '…'}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-100">
            {customer?.name ?? 'Loading…'}
            {customer?.plan && (
              <span className="ml-2 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-300">
                {customer.plan} plan
              </span>
            )}
          </p>
          <p className="text-xs text-slate-400">{customer?.email}</p>
        </div>
      </div>

      <nav className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/70 p-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              active === tab.key
                ? 'bg-slate-700/70 text-white shadow'
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
        title="Back to the customer picker"
      >
        ⇄ Switch customer
      </Link>
    </div>
  );
}
