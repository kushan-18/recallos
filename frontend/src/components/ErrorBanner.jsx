/**
 * A reusable error banner with a retry button.
 *
 * Used on every page that loads data from the API, so a backend outage
 * always shows a clear message and a way to recover — never a blank
 * crash screen.
 */
export default function ErrorBanner({ error, onRetry }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
      <span>⚠️ {error || 'Something went wrong.'}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-red-400/40 px-3 py-1 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
        >
          ↻ Retry
        </button>
      )}
    </div>
  );
}
