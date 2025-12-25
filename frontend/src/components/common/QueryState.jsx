import { ErrorState } from "./ErrorState";

export function QueryState({ loading, error, onRetry, empty, children }) {
  if (loading) return <div className="p-3 text-sm">Loading…</div>;
  if (error) return <ErrorState message={error?.message || String(error)} onRetry={onRetry} />;
  if (empty) return <div className="p-3 text-sm text-gray-500">No data for selected filters.</div>;
  return children;
}
