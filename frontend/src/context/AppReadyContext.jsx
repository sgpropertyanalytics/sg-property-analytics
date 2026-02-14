import { createContext, useContext, useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useFilterStore } from '../stores';
import { logAuthEvent, AuthTimelineEvent } from '../utils/authTimelineLogger';

// Boot stuck detection thresholds (milliseconds)
const BOOT_WARNING_THRESHOLD_MS = 3000;
const BOOT_SLOW_THRESHOLD_MS = 5000;
const BOOT_CRITICAL_THRESHOLD_MS = 10000;

/**
 * AppReadyContext - Global boot synchronization gate
 *
 * INVARIANT: `appReady` = "Firebase auth state is known" AND "filters hydrated"
 * Two conditions:
 * 1. authInitialized: Firebase onAuthStateChanged has fired
 * 2. filtersReady: Filters are hydrated from storage (prevents stale params)
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
    proReady: true,
    bootStatus: 'ready',
    banners: {},
  };
}

export function AppReadyProvider({ children }) {
  const { initialized: authInitialized } = useAuth();
  const { filtersReady, filtersDefaulted, forceDefaults } = useFilterStore();

  const appReady = authInitialized && (filtersReady || filtersDefaulted);

  const bootStartRef = useRef(Date.now());
  const hasLoggedWarningRef = useRef(false);
  const hasLoggedCriticalRef = useRef(false);
  const didForceDefaultsRef = useRef(false);

  const [isBootSlow, setIsBootSlow] = useState(false);
  const [isBootStuck, setIsBootStuck] = useState(false);

  const emitBootTelemetry = useCallback((type, payload) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(`app:boot-${type}`, { detail: payload }));
  }, []);

  useEffect(() => {
    if (appReady) {
      const bootDuration = Date.now() - bootStartRef.current;
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[AppReady] Boot complete in ${bootDuration}ms`);
      }
      logAuthEvent(AuthTimelineEvent.BOOT_COMPLETE, {
        source: 'app_ready',
        elapsed: bootDuration,
      });
      hasLoggedWarningRef.current = false;
      hasLoggedCriticalRef.current = false;
      setIsBootSlow(false);
      setIsBootStuck(false);
      return;
    }

    const blockedBy = [];
    if (!authInitialized) blockedBy.push('auth');
    if (!filtersReady) blockedBy.push('filters');

    const warningTimeoutId = setTimeout(() => {
      if (!hasLoggedWarningRef.current && !appReady) {
        hasLoggedWarningRef.current = true;
        const elapsed = Date.now() - bootStartRef.current;
        console.warn(`[AppReady] Boot slow (>${BOOT_WARNING_THRESHOLD_MS}ms)`, `Blocked by: ${blockedBy.join(', ')}`);
        emitBootTelemetry('slow', { elapsed_ms: elapsed, blocked_by: blockedBy });
      }
    }, BOOT_WARNING_THRESHOLD_MS);

    const slowTimeoutId = setTimeout(() => {
      if (!appReady) setIsBootSlow(true);
    }, BOOT_SLOW_THRESHOLD_MS);

    const criticalTimeoutId = setTimeout(() => {
      if (!hasLoggedCriticalRef.current && !appReady) {
        hasLoggedCriticalRef.current = true;
        setIsBootStuck(true);
        const elapsed = Date.now() - bootStartRef.current;
        console.error(`[AppReady] CRITICAL: Boot stuck for >${BOOT_CRITICAL_THRESHOLD_MS}ms`, `Blocked by: ${blockedBy.join(', ')}`);
        logAuthEvent(AuthTimelineEvent.BOOT_STUCK, {
          source: 'app_ready',
          elapsed,
          blockedBy,
          authInitialized,
          filtersReady,
        });
        emitBootTelemetry('stuck', { elapsed_ms: elapsed, blocked_by: blockedBy });
      }
    }, BOOT_CRITICAL_THRESHOLD_MS);

    return () => {
      clearTimeout(warningTimeoutId);
      clearTimeout(slowTimeoutId);
      clearTimeout(criticalTimeoutId);
    };
  }, [appReady, authInitialized, filtersReady, emitBootTelemetry]);

  useEffect(() => {
    if (isBootStuck && !filtersReady && !filtersDefaulted && !didForceDefaultsRef.current) {
      didForceDefaultsRef.current = true;
      console.warn('[AppReady] Boot stuck due to filter hydration, forcing defaults');
      forceDefaults();
    }
  }, [isBootStuck, filtersReady, filtersDefaulted, forceDefaults]);

  const bootPhase = appReady
    ? 'ready'
    : isBootStuck
      ? 'stuck'
      : isBootSlow
        ? 'slow'
        : 'booting';

  const value = useMemo(() => ({
    publicReady: appReady,
    authenticatedReady: appReady,
    proReady: appReady,
    bootStatus: bootPhase,
    banners: {},
    debug: import.meta.env.DEV ? {
      authInitialized,
      filtersReady,
      filtersDefaulted,
    } : undefined,
  }), [appReady, bootPhase, authInitialized, filtersReady, filtersDefaulted]);

  return (
    <AppReadyContext.Provider value={value}>
      {children}
    </AppReadyContext.Provider>
  );
}

export default AppReadyContext;
