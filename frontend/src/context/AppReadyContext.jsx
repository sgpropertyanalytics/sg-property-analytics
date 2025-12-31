import { createContext, useContext, useMemo, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import { useFilterState } from './PowerBIFilter';

// Boot stuck detection thresholds (milliseconds)
const BOOT_WARNING_THRESHOLD_MS = 3000;   // Warning: Something might be slow
const BOOT_CRITICAL_THRESHOLD_MS = 10000; // Critical: Likely a bug

/**
 * AppReadyContext - Global boot synchronization gate
 *
 * CRITICAL INVARIANT:
 * `appReady` = "Firebase auth state is KNOWN" AND "subscription resolved" AND "tier known" AND "filters hydrated"
 * `appReady` ≠ "Backend API calls complete" (that's separate from boot)
 *
 * The four conditions are:
 * 1. authInitialized: Firebase onAuthStateChanged has fired (user or null known)
 * 2. isSubscriptionReady: Subscription status is resolved (premium check complete)
 * 3. tierResolved: Tier is known (not 'unknown' loading state) - OR user not authenticated
 * 4. filtersReady: Filters are hydrated from storage (prevents stale params)
 *
 * WATCHDOG:
 * If appReady doesn't become true within BOOT_WARNING_THRESHOLD_MS, a warning is logged.
 * If appReady doesn't become true within BOOT_CRITICAL_THRESHOLD_MS, a critical error is logged.
 * This helps diagnose boot hangs in production.
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
  const { initialized: authInitialized, isAuthenticated } = useAuth();
  const { isSubscriptionReady, isTierKnown } = useSubscription();

  // filtersReady comes from PowerBIFilterProvider
  const { filtersReady } = useFilterState();

  // P0 CONSTRAINT: App is NOT ready while tier is 'unknown'
  // Exception: if user is NOT authenticated, tier='free' is immediate (no waiting)
  // isTierKnown = true when subscription.tier !== 'unknown'
  const tierResolved = !isAuthenticated || isTierKnown;

  // App is ready when ALL conditions are met:
  // 1. Auth initialized (Firebase state known)
  // 2. Subscription resolved from backend
  // 3. Tier is known (not 'unknown' loading state)
  // 4. Filters hydrated from storage
  const appReady = authInitialized && isSubscriptionReady && tierResolved && filtersReady;

  // Track boot start time for stuck detection
  const bootStartRef = useRef(Date.now());
  const hasLoggedWarningRef = useRef(false);
  const hasLoggedCriticalRef = useRef(false);
  const prevAppReadyRef = useRef(appReady);

  // Detailed boot status for debugging
  const bootStatus = useMemo(() => ({
    authInitialized,
    isSubscriptionReady,
    isTierKnown,
    tierResolved,
    filtersReady,
    appReady,
  }), [authInitialized, isSubscriptionReady, isTierKnown, tierResolved, filtersReady, appReady]);

  /**
   * Build telemetry payload for boot stuck events
   * Structured for potential remote logging (Sentry, LogRocket, etc.)
   */
  const buildTelemetryPayload = () => {
    const elapsed = Date.now() - bootStartRef.current;
    const blockedBy = [];
    if (!authInitialized) blockedBy.push('auth');
    if (!isSubscriptionReady) blockedBy.push('subscription');
    if (!tierResolved) blockedBy.push('tier_unknown');
    if (!filtersReady) blockedBy.push('filters');

    return {
      event: 'boot_stuck',
      elapsed_ms: elapsed,
      blocked_by: blockedBy,
      flags: {
        auth_initialized: authInitialized,
        subscription_ready: isSubscriptionReady,
        tier_known: isTierKnown,
        tier_resolved: tierResolved,
        filters_ready: filtersReady,
      },
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.pathname : null,
    };
  };

  // Boot stuck detection - warning at 3s, critical at 10s
  useEffect(() => {
    if (appReady) {
      // Boot completed - log duration (always, not just dev)
      const bootDuration = Date.now() - bootStartRef.current;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[AppReady] ✓ Boot complete in ${bootDuration}ms`);
      }
      // Reset flags for potential page navigation
      hasLoggedWarningRef.current = false;
      hasLoggedCriticalRef.current = false;
      return;
    }

    // Boot not complete - set up watchdog timers
    const warningTimeoutId = setTimeout(() => {
      if (!hasLoggedWarningRef.current && !appReady) {
        hasLoggedWarningRef.current = true;
        const payload = buildTelemetryPayload();
        console.warn(
          `[AppReady] ⚠️ Boot slow (>${BOOT_WARNING_THRESHOLD_MS}ms)`,
          `Blocked by: ${payload.blocked_by.join(', ')}`,
          payload
        );
        // TODO: Send to telemetry service if configured
        // telemetryService?.logEvent('boot_slow', payload);
      }
    }, BOOT_WARNING_THRESHOLD_MS);

    const criticalTimeoutId = setTimeout(() => {
      if (!hasLoggedCriticalRef.current && !appReady) {
        hasLoggedCriticalRef.current = true;
        const payload = buildTelemetryPayload();
        console.error(
          `[AppReady] 🚨 CRITICAL: Boot stuck for >${BOOT_CRITICAL_THRESHOLD_MS}ms`,
          `Blocked by: ${payload.blocked_by.join(', ')}`,
          'This is likely a bug - charts will not load.',
          payload
        );
        // TODO: Send to error tracking service if configured
        // errorTrackingService?.captureMessage('Boot stuck', { extra: payload });
      }
    }, BOOT_CRITICAL_THRESHOLD_MS);

    return () => {
      clearTimeout(warningTimeoutId);
      clearTimeout(criticalTimeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- buildTelemetryPayload is stable
  }, [appReady, authInitialized, isSubscriptionReady, tierResolved, filtersReady]);

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
            isTierKnown,
            tierResolved,
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
  }, [appReady, authInitialized, isSubscriptionReady, isTierKnown, tierResolved, filtersReady]);

  const value = useMemo(() => ({
    appReady,
    bootStatus,
    // Individual flags for specific checks
    authInitialized,
    isSubscriptionReady,
    isTierKnown,
    tierResolved,
    filtersReady,
  }), [appReady, bootStatus, authInitialized, isSubscriptionReady, isTierKnown, tierResolved, filtersReady]);

  return (
    <AppReadyContext.Provider value={value}>
      {children}
    </AppReadyContext.Provider>
  );
}

export default AppReadyContext;
