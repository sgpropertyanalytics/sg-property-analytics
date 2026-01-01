import { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';
import { exceedsBudget } from '../constants/performanceBudgets';

/**
 * ChartTimingContext - Centralized chart performance timing store
 *
 * DEV-ONLY: Zero overhead in production.
 *
 * Features:
 * - Tracks timing phases: mount → fetch → response → transform → stateUpdate → renderComplete
 * - Stores in refs to avoid render cascades
 * - Subscription pattern for UI updates (Debug Overlay, Perf Dashboard)
 * - Creates browser DevTools performance.mark/measure entries
 * - Console logging with budget comparison
 *
 * Toggle via: Ctrl+Shift+P (or Cmd+Shift+P on Mac)
 */

const isDev = import.meta.env.DEV;

// Context value shape
const ChartTimingContext = createContext(null);

// Max entries to keep in history
const MAX_HISTORY = 100;

/**
 * Create empty timing entry
 */
function createTimingEntry(chartId, chartName, queryKey) {
  return {
    chartId,
    chartName,
    queryKey,

    // Timestamps (performance.now())
    mountTime: null,
    fetchStartTime: null,
    responseTime: null,
    transformEndTime: null,
    stateUpdateTime: null,
    renderCompleteTime: null,

    // Derived durations (calculated on completion)
    timeToData: null,
    apiLatency: null,
    transformDuration: null,
    renderDuration: null,
    totalDuration: null,

    // Status
    status: 'pending',
    errorMessage: null,

    // Budget flags
    exceedsBudget: false,
    isFilterChange: false,

    // Backend timing (from response.meta)
    backendElapsedMs: null,
    requestId: null,
  };
}

/**
 * Calculate derived durations from timestamps
 */
function calculateDurations(entry) {
  const {
    mountTime,
    fetchStartTime,
    responseTime,
    transformEndTime,
    stateUpdateTime,
    renderCompleteTime,
  } = entry;

  const result = { ...entry };

  // Time to Data: mount → stateUpdate
  if (mountTime != null && stateUpdateTime != null) {
    result.timeToData = Math.round(stateUpdateTime - mountTime);
    result.exceedsBudget = exceedsBudget('timeToData', result.timeToData);
  }

  // API Latency: fetchStart → response
  if (fetchStartTime != null && responseTime != null) {
    result.apiLatency = Math.round(responseTime - fetchStartTime);
  }

  // Transform Duration: response → transformEnd
  if (responseTime != null && transformEndTime != null) {
    result.transformDuration = Math.round(transformEndTime - responseTime);
  }

  // Render Duration: stateUpdate → renderComplete
  if (stateUpdateTime != null && renderCompleteTime != null) {
    result.renderDuration = Math.round(renderCompleteTime - stateUpdateTime);
  }

  // Total Duration: mount → renderComplete
  if (mountTime != null && renderCompleteTime != null) {
    result.totalDuration = Math.round(renderCompleteTime - mountTime);
  }

  return result;
}

export function ChartTimingProvider({ children }) {
  // Skip entirely in production
  if (!isDev) {
    return children;
  }

  // Store timings in refs to avoid render cascades
  const timingsRef = useRef(new Map());
  const historyRef = useRef([]);
  const listenersRef = useRef(new Set());

  // State for subscription updates (triggers re-render in subscribers)
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // Notify all listeners
  const notifyListeners = useCallback(() => {
    setUpdateTrigger((n) => n + 1);
    listenersRef.current.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error('[ChartTiming] Listener error:', e);
      }
    });
  }, []);

  /**
   * Record a timing event for a chart
   */
  const recordTiming = useCallback(
    (chartId, phase, timestamp, meta = {}) => {
      if (!isDev) return;

      const entry = timingsRef.current.get(chartId) || createTimingEntry(chartId, meta.chartName || 'Unknown', meta.queryKey || '');

      // Update timestamp for phase
      switch (phase) {
        case 'mount':
          entry.mountTime = timestamp;
          entry.chartName = meta.chartName || entry.chartName;
          entry.status = 'pending';
          performance.mark(`${chartId}-mount`);
          break;

        case 'fetchStart':
          entry.fetchStartTime = timestamp;
          entry.queryKey = meta.queryKey || entry.queryKey;
          entry.isFilterChange = meta.isFilterChange || false;
          entry.status = 'loading';
          performance.mark(`${chartId}-fetch-start`);
          break;

        case 'response':
          entry.responseTime = timestamp;
          entry.backendElapsedMs = meta.backendElapsedMs || null;
          entry.requestId = meta.requestId || null;
          performance.mark(`${chartId}-response`);
          // Measure API latency
          try {
            performance.measure(`${chartId}-api`, `${chartId}-fetch-start`, `${chartId}-response`);
          } catch {
            // Marks may not exist
          }
          break;

        case 'transformEnd':
          entry.transformEndTime = timestamp;
          performance.mark(`${chartId}-transform-end`);
          break;

        case 'stateUpdate':
          entry.stateUpdateTime = timestamp;
          entry.status = 'success';
          performance.mark(`${chartId}-state-update`);
          // Calculate durations
          Object.assign(entry, calculateDurations(entry));
          // Log to console
          logChartTiming(entry);
          break;

        case 'renderComplete':
          entry.renderCompleteTime = timestamp;
          performance.mark(`${chartId}-render-complete`);
          // Final duration calculation
          Object.assign(entry, calculateDurations(entry));
          // Measure total
          try {
            performance.measure(`${chartId}-total`, `${chartId}-mount`, `${chartId}-render-complete`);
          } catch {
            // Marks may not exist
          }
          // Add to history
          historyRef.current.unshift({ ...entry });
          if (historyRef.current.length > MAX_HISTORY) {
            historyRef.current.pop();
          }
          break;

        case 'error':
          entry.status = 'error';
          entry.errorMessage = meta.error?.message || String(meta.error);
          performance.mark(`${chartId}-error`);
          // Add to history even on error
          historyRef.current.unshift({ ...entry });
          if (historyRef.current.length > MAX_HISTORY) {
            historyRef.current.pop();
          }
          break;

        case 'unmount':
          // Clean up performance marks on unmount
          performance.clearMarks(`${chartId}-mount`);
          performance.clearMarks(`${chartId}-fetch-start`);
          performance.clearMarks(`${chartId}-response`);
          performance.clearMarks(`${chartId}-transform-end`);
          performance.clearMarks(`${chartId}-state-update`);
          performance.clearMarks(`${chartId}-render-complete`);
          performance.clearMarks(`${chartId}-error`);
          timingsRef.current.delete(chartId);
          break;
      }

      timingsRef.current.set(chartId, entry);

      // Notify on terminal states
      if (phase === 'stateUpdate' || phase === 'error' || phase === 'renderComplete') {
        notifyListeners();
      }
    },
    [notifyListeners]
  );

  /**
   * Subscribe to timing updates
   */
  const subscribe = useCallback((listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  /**
   * Get current timing data
   */
  const getTimings = useCallback(() => {
    return {
      current: new Map(timingsRef.current),
      history: [...historyRef.current],
    };
  }, []);

  /**
   * Get summary statistics
   */
  const getSummary = useCallback(() => {
    const entries = Array.from(timingsRef.current.values()).filter((e) => e.timeToData != null);

    if (entries.length === 0) {
      return {
        chartCount: 0,
        avgTimeToData: 0,
        p95TimeToData: 0,
        budgetViolations: [],
      };
    }

    const ttdValues = entries.map((e) => e.timeToData).sort((a, b) => a - b);
    const p95Index = Math.floor(ttdValues.length * 0.95);

    return {
      chartCount: entries.length,
      avgTimeToData: Math.round(ttdValues.reduce((a, b) => a + b, 0) / ttdValues.length),
      p95TimeToData: ttdValues[p95Index] || ttdValues[ttdValues.length - 1],
      budgetViolations: entries.filter((e) => e.exceedsBudget).map((e) => e.chartName),
    };
  }, []);

  /**
   * Clear all timing data
   */
  const clearTimings = useCallback(() => {
    timingsRef.current.clear();
    historyRef.current = [];
    notifyListeners();
  }, [notifyListeners]);

  // Expose on window for console access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__CHART_TIMINGS__ = {
        getTimings,
        getSummary,
        clearTimings,
      };
    }
  }, [getTimings, getSummary, clearTimings]);

  return (
    <ChartTimingContext.Provider
      value={{
        recordTiming,
        subscribe,
        getTimings,
        getSummary,
        clearTimings,
        updateTrigger,
      }}
    >
      {children}
    </ChartTimingContext.Provider>
  );
}

/**
 * Hook to access chart timing context
 */
export function useChartTimingContext() {
  const context = useContext(ChartTimingContext);
  // Return null in prod or if outside provider
  if (!context || !isDev) {
    return null;
  }
  return context;
}

/**
 * Console logging for chart timing
 */
function logChartTiming(entry) {
  if (!isDev) return;

  const { chartName, timeToData, apiLatency, transformDuration, exceedsBudget: exceeded, backendElapsedMs } = entry;

  const icon = exceeded ? '\u{1F534}' : '\u{2705}';
  const budgetLabel = exceeded ? ' (OVER BUDGET)' : '';

  console.groupCollapsed(`${icon} [${chartName}] TTD: ${timeToData}ms${budgetLabel}`);
  console.table({
    'Time to Data': `${timeToData}ms`,
    'API Latency (FE)': `${apiLatency}ms`,
    'Backend Elapsed': backendElapsedMs ? `${backendElapsedMs}ms` : '-',
    Transform: `${transformDuration}ms`,
    Budget: '800ms',
    Exceeded: exceeded,
  });
  console.groupEnd();
}

export default ChartTimingContext;
