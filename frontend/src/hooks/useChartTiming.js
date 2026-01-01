import { useEffect, useRef, useCallback, useId, useState } from 'react';
import { useChartTimingContext } from '../context/ChartTimingContext';

const isDev = import.meta.env.DEV;

/**
 * useChartTiming - Hook for recording chart timing events
 *
 * DEV-ONLY: All operations are no-ops in production.
 *
 * Usage:
 * ```jsx
 * function MyChart() {
 *   const timing = useChartTiming('MyChart');
 *
 *   const { data } = useAbortableQuery(async (signal) => {
 *     timing.recordFetchStart();
 *     const response = await getAggregate(params, { signal });
 *     timing.recordResponse(response.meta);
 *
 *     const transformed = transformData(response.data);
 *     timing.recordTransformEnd();
 *
 *     return transformed;
 *   }, [filterKey]);
 *
 *   useEffect(() => {
 *     if (data) timing.recordRenderComplete();
 *   }, [data]);
 *
 *   return <Chart data={data} />;
 * }
 * ```
 *
 * @param {string} chartName - Name of the chart component
 * @returns {Object} Timing recording functions
 */
export function useChartTiming(chartName) {
  const context = useChartTimingContext();
  const instanceId = useId();
  const chartId = `${chartName}_${instanceId}`;
  const mountTimeRef = useRef(performance.now());
  const queryKeyRef = useRef('');

  // Record mount on first render
  useEffect(() => {
    if (!isDev || !context) return;

    context.recordTiming(chartId, 'mount', mountTimeRef.current, { chartName });

    return () => {
      context.recordTiming(chartId, 'unmount', performance.now());
    };
  }, [chartId, chartName, context]);

  const recordFetchStart = useCallback(
    (queryKey = '', isFilterChange = false) => {
      if (!isDev || !context) return;
      queryKeyRef.current = queryKey;
      context.recordTiming(chartId, 'fetchStart', performance.now(), {
        queryKey,
        isFilterChange,
      });
    },
    [chartId, context]
  );

  const recordResponse = useCallback(
    (meta = {}) => {
      if (!isDev || !context) return;
      context.recordTiming(chartId, 'response', performance.now(), {
        backendElapsedMs: meta.elapsedMs || meta.elapsed_ms,
        requestId: meta.requestId || meta.request_id,
      });
    },
    [chartId, context]
  );

  const recordTransformEnd = useCallback(() => {
    if (!isDev || !context) return;
    context.recordTiming(chartId, 'transformEnd', performance.now());
  }, [chartId, context]);

  const recordStateUpdate = useCallback(() => {
    if (!isDev || !context) return;
    context.recordTiming(chartId, 'stateUpdate', performance.now());
  }, [chartId, context]);

  const recordRenderComplete = useCallback(() => {
    if (!isDev || !context) return;
    context.recordTiming(chartId, 'renderComplete', performance.now());
  }, [chartId, context]);

  const recordError = useCallback(
    (error) => {
      if (!isDev || !context) return;
      context.recordTiming(chartId, 'error', performance.now(), { error });
    },
    [chartId, context]
  );

  // Return no-ops in production
  if (!isDev) {
    return {
      chartId: '',
      recordFetchStart: () => {},
      recordResponse: () => {},
      recordTransformEnd: () => {},
      recordStateUpdate: () => {},
      recordRenderComplete: () => {},
      recordError: () => {},
    };
  }

  return {
    chartId,
    recordFetchStart,
    recordResponse,
    recordTransformEnd,
    recordStateUpdate,
    recordRenderComplete,
    recordError,
  };
}

/**
 * useChartTimingSubscription - Subscribe to timing updates for UI components
 *
 * Usage:
 * ```jsx
 * function PerformanceDashboard() {
 *   const { timings, summary, history } = useChartTimingSubscription();
 *
 *   return (
 *     <div>
 *       <p>Charts: {summary.chartCount}</p>
 *       <p>Avg TTD: {summary.avgTimeToData}ms</p>
 *       <table>
 *         {[...timings.values()].map(entry => (
 *           <tr key={entry.chartId}>
 *             <td>{entry.chartName}</td>
 *             <td>{entry.timeToData}ms</td>
 *           </tr>
 *         ))}
 *       </table>
 *     </div>
 *   );
 * }
 * ```
 */
export function useChartTimingSubscription() {
  const context = useChartTimingContext();
  const [, forceUpdate] = useState(0);

  // Subscribe to updates
  useEffect(() => {
    if (!context) return;
    return context.subscribe(() => forceUpdate((n) => n + 1));
  }, [context]);

  if (!isDev || !context) {
    return {
      timings: new Map(),
      history: [],
      summary: {
        chartCount: 0,
        avgTimeToData: 0,
        p95TimeToData: 0,
        budgetViolations: [],
      },
    };
  }

  const { current, history } = context.getTimings();

  return {
    timings: current,
    history,
    summary: context.getSummary(),
  };
}

export default useChartTiming;
