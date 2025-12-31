import { createContext, useContext, useMemo, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import { useFilterState } from './PowerBIFilter';

// Boot stuck detection threshold (milliseconds)
const BOOT_STUCK_THRESHOLD_MS = 3000;

/**
 * AppReadyContext - Global boot synchronization gate
 *
 * Provides a single `appReady` flag that is TRUE only when:
 * 1. Auth is initialized (Firebase listener fired)
 * 2. Subscription status is resolved (we know if user is premium)
 * 3. Filters are hydrated (restored from storage)
 *
 * USE THIS to gate chart data fetching:
 * - Charts should NOT fetch until appReady === true
 * - This prevents race conditions where charts fetch before we know subscription tier
 * - This prevents "No data" flash when filters haven't been restored yet
 *
 * PLACEMENT: Must be inside PowerBIFilterProvider to access filtersReady.
 * This means it's available for dashboard routes, not public pages.
 *
 * Usage:
 * ```jsx
 * const { appReady } = useAppReady();
 *
 * const { data } = useAbortableQuery(
 *   fetchFn,
 *   [debouncedFilterKey],
 *   { enabled: appReady }  // <-- Gate fetches
 * );
 * ```
 */

const AppReadyContext = createContext(null);

export function useAppReady() {
  const context = useContext(AppReadyContext);
  if (!context) {
    throw new Error('useAppReady must be used within AppReadyProvider');
  }
  return context;
}

/**
 * Try to get appReady without throwing - returns default if not in provider
 * Useful for components that may render outside the provider (landing page, login)
 */
export function useAppReadyOptional() {
  const context = useContext(AppReadyContext);
  // Return a safe default for public pages
  return context ?? { appReady: true, bootStatus: null };
}

export function AppReadyProvider({ children }) {
  const { initialized: authInitialized } = useAuth();
  const { isSubscriptionReady } = useSubscription();

  // filtersReady comes from PowerBIFilterProvider
  const { filtersReady } = useFilterState();

  // App is ready when all three conditions are met
  const appReady = authInitialized && isSubscriptionReady && filtersReady;

  // Track boot start time for stuck detection
  const bootStartRef = useRef(Date.now());
  const hasLoggedStuckRef = useRef(false);
  const prevAppReadyRef = useRef(appReady);

  // Detailed boot status for debugging
  const bootStatus = useMemo(() => ({
    authInitialized,
    isSubscriptionReady,
    filtersReady,
    appReady,
  }), [authInitialized, isSubscriptionReady, filtersReady, appReady]);

  // Boot stuck detection - warn if boot takes > 3s
  useEffect(() => {
    if (appReady) {
      // Boot completed - log duration if in dev
      if (process.env.NODE_ENV === 'development') {
        const bootDuration = Date.now() - bootStartRef.current;
        console.log(`[AppReady] ✓ Boot complete in ${bootDuration}ms`);
      }
      hasLoggedStuckRef.current = false;
      return;
    }

    // Boot not complete yet - set up stuck detection
    const timeoutId = setTimeout(() => {
      if (!hasLoggedStuckRef.current) {
        hasLoggedStuckRef.current = true;
        const stuckFlags = [];
        if (!authInitialized) stuckFlags.push('authInitialized=false');
        if (!isSubscriptionReady) stuckFlags.push('isSubscriptionReady=false');
        if (!filtersReady) stuckFlags.push('filtersReady=false');

        console.warn(
          `[AppReady] ⚠️ Boot stuck for >${BOOT_STUCK_THRESHOLD_MS}ms`,
          `Blocked by: ${stuckFlags.join(', ')}`,
          bootStatus
        );
      }
    }, BOOT_STUCK_THRESHOLD_MS);

    return () => clearTimeout(timeoutId);
  }, [appReady, authInitialized, isSubscriptionReady, filtersReady, bootStatus]);

  // Log boot state changes (dev only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Only log when appReady changes or during boot phase
      if (prevAppReadyRef.current !== appReady || !appReady) {
        console.log('[AppReady] Boot status:', {
          ...bootStatus,
          elapsed: `${Date.now() - bootStartRef.current}ms`,
        });
      }
      prevAppReadyRef.current = appReady;
    }
  }, [bootStatus, appReady]);

  // Expose debug info on window for DevTools console access
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.__APP_READY_DEBUG__ = {
        get status() {
          return {
            appReady,
            authInitialized,
            isSubscriptionReady,
            filtersReady,
            bootElapsed: `${Date.now() - bootStartRef.current}ms`,
          };
        },
      };
    }
    return () => {
      if (process.env.NODE_ENV === 'development') {
        delete window.__APP_READY_DEBUG__;
      }
    };
  }, [appReady, authInitialized, isSubscriptionReady, filtersReady]);

  const value = useMemo(() => ({
    appReady,
    bootStatus,
    // Individual flags for specific checks
    authInitialized,
    isSubscriptionReady,
    filtersReady,
  }), [appReady, bootStatus, authInitialized, isSubscriptionReady, filtersReady]);

  return (
    <AppReadyContext.Provider value={value}>
      {children}
    </AppReadyContext.Provider>
  );
}

export default AppReadyContext;
