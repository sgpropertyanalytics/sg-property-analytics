/**
 * Filter Store DevTools
 *
 * Dev-only component to compare Context vs Zustand state.
 * Helps validate that the Zustand store mirrors Context correctly during Phase 3.1.
 *
 * Usage:
 * 1. Add VITE_DEBUG_FILTER_STORE=true to .env.local
 * 2. Import and render <FilterStoreDevTools /> in App.jsx (dev only)
 *
 * Features:
 * - Side-by-side comparison of Context and Zustand state
 * - Highlights any differences in red
 * - Collapsible panel to minimize screen clutter
 * - Shows sync status and timing
 */

import { useState, useEffect, useCallback } from 'react';
import { usePowerBIFilters } from '../context/PowerBIFilter';
import { useFilterStore, usePageId, getFilterStore } from './filterStore';

// Only render in dev mode when debug flag is set
const SHOW_DEVTOOLS =
  import.meta.env.DEV && import.meta.env.VITE_DEBUG_FILTER_STORE === 'true';

/**
 * Compare two values and return differences.
 */
function deepCompare(contextVal, zustandVal, path = '') {
  const diffs = [];

  if (contextVal === zustandVal) return diffs;

  if (typeof contextVal !== typeof zustandVal) {
    diffs.push({ path, context: contextVal, zustand: zustandVal, type: 'type_mismatch' });
    return diffs;
  }

  if (contextVal === null || zustandVal === null) {
    if (contextVal !== zustandVal) {
      diffs.push({ path, context: contextVal, zustand: zustandVal, type: 'null_mismatch' });
    }
    return diffs;
  }

  if (Array.isArray(contextVal) && Array.isArray(zustandVal)) {
    if (contextVal.length !== zustandVal.length) {
      diffs.push({ path, context: contextVal, zustand: zustandVal, type: 'array_length' });
      return diffs;
    }
    for (let i = 0; i < contextVal.length; i++) {
      diffs.push(...deepCompare(contextVal[i], zustandVal[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (typeof contextVal === 'object' && typeof zustandVal === 'object') {
    const allKeys = new Set([...Object.keys(contextVal), ...Object.keys(zustandVal)]);
    for (const key of allKeys) {
      diffs.push(...deepCompare(contextVal[key], zustandVal[key], path ? `${path}.${key}` : key));
    }
    return diffs;
  }

  if (contextVal !== zustandVal) {
    diffs.push({ path, context: contextVal, zustand: zustandVal, type: 'value_mismatch' });
  }

  return diffs;
}

/**
 * Format a value for display.
 */
function formatValue(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/**
 * DevTools panel component.
 */
function DevToolsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [diffs, setDiffs] = useState([]);

  // Get Context state
  const contextState = usePowerBIFilters();

  // Get Zustand state
  const pageId = usePageId();
  const zustandStore = getFilterStore(pageId);
  const zustandState = zustandStore.getState();

  // Compare states
  const compareStates = useCallback(() => {
    const stateToCompare = {
      filters: contextState.filters,
      factFilter: contextState.factFilter,
      drillPath: contextState.drillPath,
      breadcrumbs: contextState.breadcrumbs,
      selectedProject: contextState.selectedProject,
      timeGrouping: contextState.timeGrouping,
      filtersReady: contextState.filtersReady,
      pageId: contextState.pageId,
    };

    const zustandToCompare = {
      filters: zustandState.filters,
      factFilter: zustandState.factFilter,
      drillPath: zustandState.drillPath,
      breadcrumbs: zustandState.breadcrumbs,
      selectedProject: zustandState.selectedProject,
      timeGrouping: zustandState.timeGrouping,
      filtersReady: zustandState.filtersReady,
      pageId: zustandState.pageId,
    };

    const newDiffs = deepCompare(stateToCompare, zustandToCompare);
    setDiffs(newDiffs);
    setLastSyncTime(new Date().toLocaleTimeString());
  }, [contextState, zustandState]);

  // Compare on mount and when states change
  useEffect(() => {
    compareStates();
  }, [compareStates]);

  // Subscribe to Zustand changes
  useEffect(() => {
    const unsubscribe = zustandStore.subscribe(() => {
      compareStates();
    });
    return unsubscribe;
  }, [zustandStore, compareStates]);

  const isSynced = diffs.length === 0;

  const panelStyle = {
    position: 'fixed',
    bottom: '10px',
    right: '10px',
    zIndex: 9999,
    fontFamily: 'Monaco, Consolas, monospace',
    fontSize: '11px',
  };

  const badgeStyle = {
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: isSynced ? '#10b981' : '#ef4444',
    color: 'white',
    fontWeight: 'bold',
    display: 'inline-block',
  };

  const panelContentStyle = {
    backgroundColor: '#1f2937',
    color: '#f3f4f6',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '8px',
    maxWidth: '500px',
    maxHeight: '400px',
    overflow: 'auto',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
  };

  const diffRowStyle = {
    padding: '4px 0',
    borderBottom: '1px solid #374151',
  };

  return (
    <div style={panelStyle}>
      <div style={badgeStyle} onClick={() => setIsOpen(!isOpen)}>
        {isSynced ? '✓ Zustand Synced' : `✗ ${diffs.length} Diff${diffs.length > 1 ? 's' : ''}`}
      </div>

      {isOpen && (
        <div style={panelContentStyle}>
          <div style={{ marginBottom: '8px', color: '#9ca3af' }}>
            <strong>Filter Store DevTools</strong>
            <span style={{ float: 'right' }}>Last check: {lastSyncTime}</span>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div>Page: <code style={{ color: '#60a5fa' }}>{contextState.pageId}</code></div>
            <div>Filters Ready: {contextState.filtersReady ? '✓' : '✗'}</div>
            <div>Time Filter: <code style={{ color: '#60a5fa' }}>{formatValue(contextState.filters?.timeFilter)}</code></div>
          </div>

          {isSynced ? (
            <div style={{ color: '#10b981' }}>
              ✓ Context and Zustand are in sync!
            </div>
          ) : (
            <div>
              <div style={{ color: '#ef4444', marginBottom: '8px' }}>
                ✗ Found {diffs.length} difference{diffs.length > 1 ? 's' : ''}:
              </div>
              {diffs.map((diff, i) => (
                <div key={i} style={diffRowStyle}>
                  <div style={{ color: '#fbbf24' }}>{diff.path || '(root)'}</div>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Context: </span>
                    <code style={{ color: '#60a5fa' }}>{formatValue(diff.context)}</code>
                  </div>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Zustand: </span>
                    <code style={{ color: '#f87171' }}>{formatValue(diff.zustand)}</code>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #374151' }}>
            <button
              onClick={compareStates}
              style={{
                padding: '4px 8px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '8px',
              }}
            >
              Refresh
            </button>
            <button
              onClick={() => {
                console.group('[FilterStoreDevTools] State Dump');
                console.log('Context:', contextState);
                console.log('Zustand:', zustandState);
                console.log('Diffs:', diffs);
                console.groupEnd();
              }}
              style={{
                padding: '4px 8px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Log to Console
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Export wrapper that only renders in dev mode.
 */
export function FilterStoreDevTools() {
  if (!SHOW_DEVTOOLS) {
    return null;
  }

  return <DevToolsPanel />;
}

export default FilterStoreDevTools;
