import { createContext, useContext, useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
// Phase 4: Migrated from useFilterState (Context) to useFilterStore (Zustand)
// Using useFilterStore directly to access both state and forceDefaults action
import { useFilterStore } from '../stores';
import { logAuthEvent, AuthTimelineEvent } from '../utils/authTimelineLogger';

// Boot stuck detection thresholds (milliseconds)
const BOOT_WARNING_THRESHOLD_MS = 3000;   // Warning: Something might be slow (console only)
const BOOT_SLOW_THRESHOLD_MS = 5000;      // Slow: Show "backend waking up" banner
const BOOT_CRITICAL_THRESHOLD_MS = 10000; // Critical: Likely a bug

/**
 * AppReadyContext - Global boot synchronization gate
 *
 * CRITICAL INVARIANT:
 * `authenticatedReady` = "Firebase auth state is known" AND "access thread resolved" AND "access known" AND "filters hydrated"
 * `authenticatedReady` ≠ "Backend API calls complete" (that's separate from boot)
 *
 * The four conditions are:
 * 1. authInitialized: Firebase onAuthStateChanged has fired (user or null known)
 * 2. accessThreadResolved: Access thread completed (ready/degraded/error)
 * 3. accessResolved: Access state is known (server OR cache) - OR user not authenticated
 * 4. filtersReady: Filters are hydrated from storage (prevents stale params)
 */

const AppReadyContext = createContext(null);

export function useAppReady() {
  const context = useContext(AppReadyContext);
  if (!context) {
    throw new Error('useAppReady must be used within AppReadyProvider');
  }
  return context;
}

export function useAppReadyOptional() {
  const context = useContext(AppReadyContext);
  return context ?? {
    publicReady: true,
    authenticatedReady: true,
    proReady: true, // compatibility alias
    bootStatus: 'ready',
    banners: {},
  };
}

export function AppReadyProvider({ children }) {
  const { initialized: authInitialized, isAuthenticated } = useAuth();
  const accessStatus = 'ready';
  const accessLevel = isAuthenticated ? 'authenticated' : 'anonymous';
  const accessSource = isAuthenticated ? 'server' : 'none';

  const filterStore = useFilterStore();
  const { filtersReady, filtersDefaulted, forceDefaults } = filterStore;

  const accessResolved = true;

  const publicReady = authInitialized && (filtersReady || filtersDefaulted);
  const accessThreadResolved = true;
  const authenticatedReady = publicReady && accessThreadResolved;

  const appReady = authenticatedReady;
  const usingCachedAccess = false;

  const bootStartRef = useRef(Date.now());
  const hasLoggedWarningRef = useRef(false);
  const hasLoggedCriticalRef = useRef(false);
  const prevAppReadyRef = useRef(appReady);
  const didForceDefaultsRef = useRef(false);

  const [isBootSlow, setIsBootSlow] = useState(false);
  const [isBootStuck, setIsBootStuck] = useState(false);

  const bootStatus = useMemo(() => ({
    authInitialized,
    accessThreadResolved,
    accessResolved,
    accessSource,
    filtersReady,
    filtersDefaulted,
    publicReady,
    authenticatedReady,
    appReady,
  }), [authInitialized, accessThreadResolved, accessResolved, accessSource, filtersReady, filtersDefaulted, publicReady, authenticatedReady, appReady]);

  const buildTelemetryPayload = () => {
    const elapsed = Date.now() - bootStartRef.current;
    const blockedBy = [];
    if (!authInitialized) blockedBy.push('auth');
    if (!filtersReady) blockedBy.push('filters');

    return {
      event: 'boot_stuck',
      elapsed_ms: elapsed,
      blocked_by: blockedBy,
      flags: {
        auth_initialized: authInitialized,
        access_thread_ready: accessThreadResolved,
        access_resolved: accessResolved,
        access_source: accessSource,
        using_cached_access: usingCachedAccess,
        filters_ready: filtersReady,
      },
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.pathname : null,
    };
  };

  const emitBootTelemetry = useCallback((type, payload) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(`app:boot-${type}`, { detail: payload }));
  }, []);

  useEffect(() => {
    if (appReady) {
      const bootDuration = Date.now() - bootStartRef.current;
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[AppReady] ✓ Boot complete in ${bootDuration}ms`);
      }
      logAuthEvent(AuthTimelineEvent.BOOT_COMPLETE, {
        source: 'app_ready',
        elapsed: bootDuration,
        accessLevelAfter: accessLevel,
        accessSourceAfter: accessSource,
        statusAfter: accessStatus,
      });
      hasLoggedWarningRef.current = false;
      hasLoggedCriticalRef.current = false;
      setIsBootSlow(false);
      setIsBootStuck(false);
      return;
    }

    const warningTimeoutId = setTimeout(() => {
      if (!hasLoggedWarningRef.current && !appReady) {
        hasLoggedWarningRef.current = true;
        const payload = buildTelemetryPayload();
        console.warn(
          `[AppReady] ⚠️ Boot slow (>${BOOT_WARNING_THRESHOLD_MS}ms)`,
          `Blocked by: ${payload.blocked_by.join(', ')}`,
          payload
        );
        emitBootTelemetry('slow', payload);
      }
    }, BOOT_WARNING_THRESHOLD_MS);

    const slowTimeoutId = setTimeout(() => {
      if (!appReady) {
        setIsBootSlow(true);
      }
    }, BOOT_SLOW_THRESHOLD_MS);

    const criticalTimeoutId = setTimeout(() => {
      if (!hasLoggedCriticalRef.current && !appReady) {
        hasLoggedCriticalRef.current = true;
        setIsBootStuck(true);
        const payload = buildTelemetryPayload();
        console.error(
          `[AppReady] 🚨 CRITICAL: Boot stuck for >${BOOT_CRITICAL_THRESHOLD_MS}ms`,
          `Blocked by: ${payload.blocked_by.join(', ')}`,
          'This is likely a bug - charts will not load.',
          payload
        );
        logAuthEvent(AuthTimelineEvent.BOOT_STUCK, {
          source: 'app_ready',
          elapsed: payload.elapsed_ms,
          blockedBy: payload.blocked_by,
          accessLevelAfter: accessLevel,
          accessSourceAfter: accessSource,
          statusAfter: accessStatus,
          authInitialized,
          accessThreadResolved,
          accessResolved,
          filtersReady,
        });
        emitBootTelemetry('stuck', payload);
      }
    }, BOOT_CRITICAL_THRESHOLD_MS);

    return () => {
      clearTimeout(warningTimeoutId);
      clearTimeout(slowTimeoutId);
      clearTimeout(criticalTimeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- buildTelemetryPayload is stable
  }, [appReady, authInitialized, accessThreadResolved, accessResolved, filtersReady, emitBootTelemetry]);

  useEffect(() => {
    if (isBootStuck && !filtersReady && !filtersDefaulted && !didForceDefaultsRef.current) {
      didForceDefaultsRef.current = true;
      console.warn('[AppReady] Boot stuck due to filter hydration, forcing defaults');
      forceDefaults();
    }
  }, [isBootStuck, filtersReady, filtersDefaulted, forceDefaults]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      if (prevAppReadyRef.current !== appReady || !appReady) {
        console.warn('[AppReady] Boot status:', {
          accessStatus,
          'publicReady/authenticatedReady': `${publicReady}/${authenticatedReady}`,
          accessLevel,
          accessSource,
          usingCachedAccess,
          ...bootStatus,
          elapsed: `${Date.now() - bootStartRef.current}ms`,
        });
      }
      prevAppReadyRef.current = appReady;
    }
  }, [bootStatus, appReady, accessStatus, publicReady, authenticatedReady, accessLevel, accessSource, usingCachedAccess]);

  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    const hasDebugParam = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('__debug');

    if (!isDev && !hasDebugParam) return;

    window.__APP_READY_DEBUG__ = {
      get status() {
        return {
          accessStatus,
          accessLevel,
          accessSource,
          usingCachedAccess,
          appReady,
          publicReady,
          authenticatedReady,
          proReady: authenticatedReady, // compatibility alias
          accessThreadResolved,
          authInitialized,
          accessResolved,
          filtersReady,
          filtersDefaulted,
          isBootSlow,
          isBootStuck,
          bootElapsed: `${Date.now() - bootStartRef.current}ms`,
        };
      },
    };

    return () => {
      delete window.__APP_READY_DEBUG__;
    };
  }, [appReady, publicReady, authenticatedReady, accessThreadResolved, authInitialized, accessResolved, accessSource, usingCachedAccess, filtersReady, filtersDefaulted, isBootSlow, isBootStuck, accessStatus, accessLevel]);

  const bootPhase = appReady
    ? 'ready'
    : isBootStuck
      ? 'stuck'
      : isBootSlow
        ? 'slow'
        : 'booting';

  const value = useMemo(() => ({
    publicReady,
    authenticatedReady,
    proReady: authenticatedReady, // compatibility alias
    bootStatus: bootPhase,
    banners: {
      usingCachedAccess,
    },
    debug: import.meta.env.DEV ? {
      authInitialized,
      filtersReady,
      filtersDefaulted,
      accessThreadResolved,
      accessSource,
    } : undefined,
  }), [publicReady, authenticatedReady, bootPhase, usingCachedAccess, authInitialized, filtersReady, filtersDefaulted, accessThreadResolved, accessSource]);

  return (
    <AppReadyContext.Provider value={value}>
      {children}
    </AppReadyContext.Provider>
  );
}

export default AppReadyContext;
