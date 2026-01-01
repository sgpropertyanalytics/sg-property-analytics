import { useState, useMemo } from 'react';
import { useChartTimingSubscription } from '../hooks/useChartTiming';
import { PERFORMANCE_BUDGETS } from '../constants/performanceBudgets';

/**
 * PerformanceDashboard - Dev-only page for chart timing analysis
 *
 * Route: /perf (only available in development)
 *
 * Features:
 * - Summary cards (avg TTD, p95 TTD, budget violations)
 * - Sortable table of all chart timings
 * - Highlights charts exceeding budget
 * - History of completed requests
 */
export function PerformanceDashboard() {
  const { timings, history, summary } = useChartTimingSubscription();
  const [sortBy, setSortBy] = useState('timeToData');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showHistory, setShowHistory] = useState(false);

  // Sort entries
  const sortedEntries = useMemo(() => {
    const entries = showHistory ? history : Array.from(timings.values());
    return entries.sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [timings, history, sortBy, sortOrder, showHistory]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return null;
    return <span className="ml-1">{sortOrder === 'desc' ? '\u25BC' : '\u25B2'}</span>;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cyan-400">Performance Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Chart timing instrumentation (dev-only)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Charts"
          value={summary.chartCount}
          color="cyan"
        />
        <MetricCard
          label="Avg TTD"
          value={`${summary.avgTimeToData}ms`}
          color={summary.avgTimeToData > PERFORMANCE_BUDGETS.timeToData.warning ? 'yellow' : 'green'}
        />
        <MetricCard
          label="P95 TTD"
          value={`${summary.p95TimeToData}ms`}
          color={summary.p95TimeToData > PERFORMANCE_BUDGETS.timeToData.p95 ? 'red' : 'green'}
        />
        <MetricCard
          label="Budget Violations"
          value={summary.budgetViolations.length}
          color={summary.budgetViolations.length > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Budget Violations Alert */}
      {summary.budgetViolations.length > 0 && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
          <h3 className="text-red-400 font-bold mb-2">Charts Exceeding Budget ({PERFORMANCE_BUDGETS.timeToData.p95}ms)</h3>
          <div className="flex flex-wrap gap-2">
            {summary.budgetViolations.map((name, i) => (
              <span key={i} className="px-2 py-1 bg-red-900/50 rounded text-red-300 text-sm">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Toggle */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`px-4 py-2 rounded ${
            showHistory
              ? 'bg-gray-700 text-gray-300'
              : 'bg-cyan-600 text-white'
          }`}
        >
          Current ({timings.size})
        </button>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`px-4 py-2 rounded ${
            showHistory
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-700 text-gray-300'
          }`}
        >
          History ({history.length})
        </button>
      </div>

      {/* Timing Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="py-3 px-4 text-left text-gray-400">Chart</th>
              <th className="py-3 px-4 text-left text-gray-400">Status</th>
              <th
                className="py-3 px-4 text-right text-gray-400 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('timeToData')}
              >
                TTD <SortIcon column="timeToData" />
              </th>
              <th
                className="py-3 px-4 text-right text-gray-400 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('apiLatency')}
              >
                API (FE) <SortIcon column="apiLatency" />
              </th>
              <th
                className="py-3 px-4 text-right text-gray-400 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('backendElapsedMs')}
              >
                API (BE) <SortIcon column="backendElapsedMs" />
              </th>
              <th
                className="py-3 px-4 text-right text-gray-400 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('transformDuration')}
              >
                Transform <SortIcon column="transformDuration" />
              </th>
              <th
                className="py-3 px-4 text-right text-gray-400 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('totalDuration')}
              >
                Total <SortIcon column="totalDuration" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">
                  No timing data yet. Navigate to a dashboard page with charts.
                </td>
              </tr>
            ) : (
              sortedEntries.map((entry) => (
                <ChartTimingRow key={entry.chartId} entry={entry} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Console Commands */}
      <div className="mt-8 p-4 bg-gray-800 rounded-lg">
        <h3 className="text-gray-400 font-bold mb-2">Console Commands</h3>
        <code className="text-green-400 text-sm">
          window.__CHART_TIMINGS__.getTimings() - Get all timing data<br />
          window.__CHART_TIMINGS__.getSummary() - Get summary stats<br />
          window.__CHART_TIMINGS__.clearTimings() - Clear all data
        </code>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  const colorClasses = {
    cyan: 'bg-cyan-900/30 border-cyan-500/50 text-cyan-400',
    green: 'bg-green-900/30 border-green-500/50 text-green-400',
    yellow: 'bg-yellow-900/30 border-yellow-500/50 text-yellow-400',
    red: 'bg-red-900/30 border-red-500/50 text-red-400',
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function ChartTimingRow({ entry }) {
  const {
    chartName,
    status,
    timeToData,
    apiLatency,
    backendElapsedMs,
    transformDuration,
    totalDuration,
    exceedsBudget,
    isFilterChange,
  } = entry;

  const statusColors = {
    pending: 'text-gray-400',
    loading: 'text-yellow-400',
    success: 'text-green-400',
    error: 'text-red-400',
  };

  const statusIcons = {
    pending: '\u23F3',
    loading: '\u23F1',
    success: '\u2705',
    error: '\u274C',
  };

  const formatMs = (ms) => (ms != null ? `${ms}ms` : '-');

  return (
    <tr className={`border-b border-gray-800 ${exceedsBudget ? 'bg-red-900/20' : ''}`}>
      <td className="py-3 px-4">
        <span className={exceedsBudget ? 'text-red-400' : 'text-gray-200'}>
          {chartName}
        </span>
        {isFilterChange && (
          <span className="ml-2 text-xs text-purple-400">(filter)</span>
        )}
      </td>
      <td className={`py-3 px-4 ${statusColors[status]}`}>
        {statusIcons[status]} {status}
      </td>
      <td className={`py-3 px-4 text-right font-mono ${exceedsBudget ? 'text-red-400 font-bold' : 'text-gray-200'}`}>
        {formatMs(timeToData)}
      </td>
      <td className="py-3 px-4 text-right font-mono text-gray-300">
        {formatMs(apiLatency)}
      </td>
      <td className="py-3 px-4 text-right font-mono text-gray-300">
        {formatMs(backendElapsedMs)}
      </td>
      <td className="py-3 px-4 text-right font-mono text-gray-300">
        {formatMs(transformDuration)}
      </td>
      <td className="py-3 px-4 text-right font-mono text-gray-300">
        {formatMs(totalDuration)}
      </td>
    </tr>
  );
}

export default PerformanceDashboard;
