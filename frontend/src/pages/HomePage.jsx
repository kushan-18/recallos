import { useCallback, useEffect, useState } from 'react';
import { healthApi } from '../api/client.js';
import StatusCard from '../components/StatusCard.jsx';

/**
 * The home page. For now it just verifies the foundation:
 * the frontend can reach the backend.
 * (The real customer chat page replaces most of this in Phase 3.)
 */
export default function HomePage() {
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const checkHealth = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const result = await healthApi.get();
      setData(result);
      setStatus('success');
    } catch (err) {
      setError(
        `${err.message}. Is the backend running? Start it with "npm run dev" inside the backend folder.`,
      );
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Foundation check
        </h2>
        <p className="mt-1 text-slate-400">
          If the card below turns green, the frontend and backend are talking
          to each other. The memory engine gets built on top of this.
        </p>
      </div>

      <StatusCard status={status} data={data} error={error} />

      <button
        onClick={checkHealth}
        className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
      >
        ↻ Re-check
      </button>
    </section>
  );
}
