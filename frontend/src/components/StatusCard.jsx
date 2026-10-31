/**
 * A small card that shows the status of something (right now: the backend).
 * It's "presentational" - it only renders what it receives via props,
 * it doesn't fetch anything itself. That makes it easy to reuse later.
 */
const STYLES = {
  loading: 'border-slate-700 bg-slate-900 text-slate-300',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  error: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
};

const LABELS = {
  loading: 'Checking…',
  success: 'Connected',
  error: 'Disconnected',
};

export default function StatusCard({ status = 'loading', data, error }) {
  return (
    <div
      className={`rounded-xl border p-5 ${STYLES[status] ?? STYLES.loading}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Backend API</h2>
        <span className="text-sm">{LABELS[status] ?? LABELS.loading}</span>
      </div>

      {status === 'loading' && (
        <p className="mt-2 text-sm text-slate-400">
          Pinging http://localhost:5000/api/health…
        </p>
      )}

      {status === 'success' && data && (
        <dl className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">Service</dt>
            <dd>{data.service}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Environment</dt>
            <dd>{data.environment}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Uptime</dt>
            <dd>{data.uptimeSeconds}s</dd>
          </div>
          <div>
            <dt className="text-slate-400">Server time</dt>
            <dd>{data.timestamp}</dd>
          </div>
        </dl>
      )}

      {status === 'error' && (
        <p className="mt-2 text-sm">{error}</p>
      )}
    </div>
  );
}
