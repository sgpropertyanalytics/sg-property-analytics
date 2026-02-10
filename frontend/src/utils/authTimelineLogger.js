/**
 * Auth Timeline Debug Logger
 *
 * Tracks every access/subscription mutation for debugging auth instability.
 * DEV-only - zero overhead in production.
 */

const MAX_HISTORY = 100;
let history = [];
const listeners = new Set();

let bootStart = null;

export const AuthTimelineEvent = {
  BOOT_START: 'BOOT_START',
  BOOT_COMPLETE: 'BOOT_COMPLETE',
  BOOT_STUCK: 'BOOT_STUCK',

  BOOTSTRAP: 'BOOTSTRAP',
  FETCH_START: 'FETCH_START',
  FETCH_OK: 'FETCH_OK',
  FETCH_ERR: 'FETCH_ERR',
  CACHE_LOAD: 'CACHE_LOAD',
  CLEAR: 'CLEAR',
  REFRESH_START: 'REFRESH_START',
  REFRESH_OK: 'REFRESH_OK',
  REFRESH_ERR: 'REFRESH_ERR',

  AUTH_401: 'AUTH_401',
  AUTH_403: 'AUTH_403',
  GATEWAY_ERR: 'GATEWAY_ERR',
  ABORT: 'ABORT',
  TIMEOUT: 'TIMEOUT',

  AUTH_STATE_CHANGE: 'AUTH_STATE_CHANGE',
  AUTH_NO_USER: 'AUTH_NO_USER',
  AUTH_FAILURE: 'AUTH_FAILURE',

  PENDING_TIMEOUT: 'PENDING_TIMEOUT',
};

const pickAccessLevel = (data, keyBefore, keyAfter) => ({
  before: data[keyBefore] ?? data.tierBefore,
  after: data[keyAfter] ?? data.tierAfter,
});

const pickAccessSource = (data, keyBefore, keyAfter) => ({
  before: data[keyBefore] ?? data.tierSourceBefore,
  after: data[keyAfter] ?? data.tierSourceAfter,
});

export const logAuthEvent = (event, data = {}) => {
  if (!import.meta.env.DEV) return;

  if (bootStart === null) {
    bootStart = Date.now();
  }

  const entry = {
    event,
    timestamp: new Date().toISOString(),
    elapsed: Date.now() - bootStart,
    ...data,
  };

  history.push(entry);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  const changes = [];

  const accessLevel = pickAccessLevel(data, 'accessLevelBefore', 'accessLevelAfter');
  if (accessLevel.before !== undefined && accessLevel.after !== undefined && accessLevel.before !== accessLevel.after) {
    changes.push(`accessLevel: ${accessLevel.before} → ${accessLevel.after}`);
  }

  if (data.statusBefore !== undefined && data.statusAfter !== undefined && data.statusBefore !== data.statusAfter) {
    changes.push(`status: ${data.statusBefore} → ${data.statusAfter}`);
  }

  const accessSource = pickAccessSource(data, 'accessSourceBefore', 'accessSourceAfter');
  if (accessSource.before !== undefined && accessSource.after !== undefined && accessSource.before !== accessSource.after) {
    changes.push(`accessSource: ${accessSource.before} → ${accessSource.after}`);
  }

  const changeStr = changes.length > 0 ? `| ${changes.join(', ')}` : '';
  const sourceStr = data.source ? `(${data.source})` : '';

  console.warn(
    `[Auth:Timeline] ${event}`,
    sourceStr,
    changeStr,
    entry
  );

  listeners.forEach((fn) => {
    try {
      fn(entry);
    } catch {
      // Ignore listener errors
    }
  });
};

export const subscribeToTimeline = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getTimelineHistory = () => [...history];

export const clearTimelineHistory = () => {
  history = [];
};

if (import.meta.env.DEV) {
  window.__AUTH_TIMELINE__ = {
    getHistory: () => [...history],

    getLastN: (n = 10) => history.slice(-n),

    clear: () => {
      history = [];
      console.warn('[Auth:Timeline] History cleared');
    },

    findRaces: () => {
      const races = [];
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];

        const prevAccess = prev.accessLevelAfter ?? prev.tierAfter;
        const currAccess = curr.accessLevelAfter ?? curr.tierAfter;

        // Access regression from authenticated to anonymous.
        if (prevAccess === 'authenticated' && currAccess === 'anonymous') {
          races.push({
            type: 'ACCESS_DOWNGRADE',
            from: prev,
            to: curr,
            warning: 'Authenticated access overwritten by anonymous - possible stale response',
          });
        }

        // Known access overwritten by unknown.
        if (prevAccess && prevAccess !== 'unknown' && currAccess === 'unknown') {
          races.push({
            type: 'ACCESS_UNKNOWN_OVERWRITE',
            from: prev,
            to: curr,
            warning: 'Known access overwritten by unknown - likely race condition',
          });
        }
      }
      return races;
    },

    getSummary: () => {
      const eventCounts = {};
      let lastAccessLevel = 'unknown';
      let accessLevelChanges = 0;

      history.forEach((entry) => {
        eventCounts[entry.event] = (eventCounts[entry.event] || 0) + 1;
        const accessLevel = entry.accessLevelAfter ?? entry.tierAfter;
        if (accessLevel && accessLevel !== lastAccessLevel) {
          accessLevelChanges++;
          lastAccessLevel = accessLevel;
        }
      });

      return {
        totalEvents: history.length,
        eventCounts,
        accessLevelChanges,
        lastEvent: history[history.length - 1] || null,
        bootElapsed: bootStart ? Date.now() - bootStart : 0,
      };
    },

    filterBySource: (source) => history.filter((e) => e.source === source),

    filterByEvent: (event) => history.filter((e) => e.event === event),
  };
}
