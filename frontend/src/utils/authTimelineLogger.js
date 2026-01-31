/**
 * Auth Timeline Debug Logger
 *
 * Tracks every tier/subscription mutation for debugging auth instability.
 * DEV-only - zero overhead in production.
 *
 * Usage:
 *   import { logAuthEvent, AuthTimelineEvent } from '../utils/authTimelineLogger';
 *   logAuthEvent(AuthTimelineEvent.FETCH_OK, { source: 'fetch', tierBefore, tierAfter, ... });
 *
 * Console access:
 *   window.__AUTH_TIMELINE__.getHistory()    // Full history
 *   window.__AUTH_TIMELINE__.getLastN(5)     // Last N events
 *   window.__AUTH_TIMELINE__.findRaces()     // Detect tier overwrites
 *   window.__AUTH_TIMELINE__.clear()         // Reset history
 */

const MAX_HISTORY = 100;
let history = [];
const listeners = new Set();

// Boot timestamp for elapsed time calculation
let bootStart = null;

/**
 * Event types for auth timeline
 */
export const AuthTimelineEvent = {
  // Boot events
  BOOT_START: 'BOOT_START',
  BOOT_COMPLETE: 'BOOT_COMPLETE',
  BOOT_STUCK: 'BOOT_STUCK',

  // Subscription events
  BOOTSTRAP: 'BOOTSTRAP',
  FETCH_START: 'FETCH_START',
  FETCH_OK: 'FETCH_OK',
  FETCH_ERR: 'FETCH_ERR',
  CACHE_LOAD: 'CACHE_LOAD',
  CLEAR: 'CLEAR',
  REFRESH_START: 'REFRESH_START',
  REFRESH_OK: 'REFRESH_OK',
  REFRESH_ERR: 'REFRESH_ERR',

  // Error classification
  AUTH_401: 'AUTH_401',
  AUTH_403: 'AUTH_403',
  GATEWAY_ERR: 'GATEWAY_ERR',
  ABORT: 'ABORT',
  TIMEOUT: 'TIMEOUT',

  // Auth context events
  AUTH_STATE_CHANGE: 'AUTH_STATE_CHANGE',
  AUTH_NO_USER: 'AUTH_NO_USER',
  AUTH_FAILURE: 'AUTH_FAILURE',

  // Timeout fallback events
  PENDING_TIMEOUT: 'PENDING_TIMEOUT',
};

/**
 * Log an auth timeline event
 * @param {string} event - Event type from AuthTimelineEvent
 * @param {object} data - Event data (source, requestId, tierBefore, tierAfter, etc.)
 */
export const logAuthEvent = (event, data = {}) => {
  // No-op in production
  if (!import.meta.env.DEV) return;

  // Initialize boot start on first call
  if (bootStart === null) {
    bootStart = Date.now();
  }

  const entry = {
    event,
    timestamp: new Date().toISOString(),
    elapsed: Date.now() - bootStart,
    ...data,
  };

  // Add to history with size limit
  history.push(entry);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  // Build console message with before→after format
  const changes = [];

  if (data.tierBefore !== undefined && data.tierAfter !== undefined && data.tierBefore !== data.tierAfter) {
    changes.push(`tier: ${data.tierBefore} → ${data.tierAfter}`);
  }

  if (data.statusBefore !== undefined && data.statusAfter !== undefined && data.statusBefore !== data.statusAfter) {
    changes.push(`status: ${data.statusBefore} → ${data.statusAfter}`);
  }

  if (data.tierSourceBefore !== undefined && data.tierSourceAfter !== undefined && data.tierSourceBefore !== data.tierSourceAfter) {
    changes.push(`tierSource: ${data.tierSourceBefore} → ${data.tierSourceAfter}`);
  }

  const changeStr = changes.length > 0 ? `| ${changes.join(', ')}` : '';
  const sourceStr = data.source ? `(${data.source})` : '';

  // Use console.warn for visibility (matches existing pattern)
  console.warn(
    `[Auth:Timeline] ${event}`,
    sourceStr,
    changeStr,
    entry
  );

  // Notify listeners (for potential UI overlay)
  listeners.forEach(fn => {
    try {
      fn(entry);
    } catch (e) {
      // Ignore listener errors
    }
  });
};

/**
 * Subscribe to timeline events
 * @param {function} listener - Callback function(entry)
 * @returns {function} Unsubscribe function
 */
export const subscribeToTimeline = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Get current history
 * @returns {array} Copy of history array
 */
export const getTimelineHistory = () => [...history];

/**
 * Clear history (for testing)
 */
export const clearTimelineHistory = () => {
  history = [];
};

// Window exposure for console debugging (DEV only)
if (import.meta.env.DEV) {
  window.__AUTH_TIMELINE__ = {
    getHistory: () => [...history],

    getLastN: (n = 10) => history.slice(-n),

    clear: () => {
      history = [];
      console.warn('[Auth:Timeline] History cleared');
    },

    /**
     * Find potential race conditions:
     * - Tier going backwards (premium → free/unknown)
     * - Status regression
     */
    findRaces: () => {
      const races = [];
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];

        // Tier downgrade from premium to free (suspicious)
        if (prev.tierAfter === 'premium' && curr.tierAfter === 'free') {
          races.push({
            type: 'TIER_DOWNGRADE',
            from: prev,
            to: curr,
            warning: 'Premium overwritten by free - possible stale response',
          });
        }

        // Tier overwritten by unknown (very suspicious)
        if (prev.tierAfter && prev.tierAfter !== 'unknown' && curr.tierAfter === 'unknown') {
          races.push({
            type: 'TIER_UNKNOWN_OVERWRITE',
            from: prev,
            to: curr,
            warning: 'Known tier overwritten by unknown - likely race condition',
          });
        }
      }
      return races;
    },

    /**
     * Get summary statistics
     */
    getSummary: () => {
      const eventCounts = {};
      let lastTier = 'unknown';
      let tierChanges = 0;

      history.forEach(entry => {
        eventCounts[entry.event] = (eventCounts[entry.event] || 0) + 1;
        if (entry.tierAfter && entry.tierAfter !== lastTier) {
          tierChanges++;
          lastTier = entry.tierAfter;
        }
      });

      return {
        totalEvents: history.length,
        eventCounts,
        tierChanges,
        lastEvent: history[history.length - 1] || null,
        bootElapsed: bootStart ? Date.now() - bootStart : 0,
      };
    },

    /**
     * Filter by source
     */
    filterBySource: (source) => history.filter(e => e.source === source),

    /**
     * Filter by event type
     */
    filterByEvent: (event) => history.filter(e => e.event === event),
  };
}
