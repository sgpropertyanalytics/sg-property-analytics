import { createContext, useContext, useMemo, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
// Phase 4: Migrated from useFilterState (Context) to useFilterStore (Zustand)
// Using useFilterStore directly to access both state and forceDefaults action
import { useFilterStore } from '../stores';

// Boot stuck detection thresholds (milliseconds)
const BOOT_WARNING_THRESHOLD_MS = 3000;   // Warning: Something might be slow (console only)
const BOOT_SLOW_THRESHOLD_MS = 5000;      // Slow: Show "backend waking up" banner
const BOOT_CRITICAL_THRESHOLD_MS = 10000; // Critical: Likely a bug

/**
 * AppReadyContext - Global boot synchronization gate
 *
 * CRITICAL INVARIANT:
 * `proReady` = "Firebase auth state is KNOWN" AND "subscription thread resolved" AND "tier known" AND "filters hydrated"
 * `proReady` ≠ "Backend API calls complete" (that's separate from boot)
 *
 * The four conditions are:
 * 1. authInitialized: Firebase onAuthStateChanged has fired (user or null known)
 * 2. subscriptionResolved: Subscription thread completed (ready/degraded/error)
 * 3. tierResolved: Tier is known (server OR cache) - OR user not authenticated
 * 4. filtersReady: Filters are hydrated from storage (prevents stale params)
 *
 * WATCHDOG:
 * If appReady doesn't become true within BOOT_WARNING_THRESHOLD_MS, a warning is logged.
 * If appReady doesn't become true within BOOT_CRITICAL_THRESHOLD_MS, a critical error is logged.
 * This helps diagnose boot hangs in production.
 *
 * USE THIS to gate chart data fetching:
 * - Charts should NOT fetch until proReady === true
 * - This prevents race conditions where charts fetch before we know subscription tier
 * - This prevents "No data" flash when filters haven't been restored yet
 *
 * PLACEMENT: Uses Zustand store directly (no provider needed).
 * Available for dashboard routes, not public pages.
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
  // Return a safe default for public pages (all gates open)
  return context ?? {
    publicReady: true,
    proReady: true,
    bootStatus: 'ready',
    banners: {},
  };
}

export function AppReadyProvider({ children }) {
  const { initialized: authInitialized, isAuthenticated, tokenStatus } = useAuth();
  const {
    status: subscriptionStatus,
    tier,
    tierSource,
  } = useSubscription();

  // Phase 4: Filter state from Zustand store (includes forceDefaults action)
  const filterStore = useFilterStore();
  const { filtersReady, filtersDefaulted, forceDefaults } = filterStore;

  // P0 CONSTRAINT: App is NOT ready while tier is unknown
  // Exception: if user is NOT authenticated, tier='free' is immediate (no waiting)
  // Tier is known when tierSource is server OR cache
  const tierResolved = !isAuthenticated || tierSource !== 'none';

  // ==========================================================================
  // PROGRESSIVE BOOT GATES (P0 Fix)
  // ==========================================================================

  // BOOT INVARIANT: publicReady = authInitialized && (filtersReady || filtersDefaulted)
  // Allows public charts to load even if filter hydration fails (falls back to defaults)
  const publicReady = authInitialized && (filtersReady || filtersDefaulted);

  // BOOT INVARIANT: subscriptionResolved = subscription thread completed (free, premium, OR error)
  // This is what "proReady" gates on - we know the subscription state, even if it's an error
  const subscriptionResolved = subscriptionStatus !== 'pending';

  // BOOT INVARIANT: proReady = publicReady && subscriptionResolved
  // For premium-gated content (entitlement checked in RequirePro component)
  const proReady = publicReady && subscriptionResolved;

  const appReady = proReady;
  const usingCachedTier = tierSource === 'cache' && isAuthenticated;

  // Track boot start time for stuck detection
  const bootStartRef = useRef(Date.now());
  const hasLoggedWarningRef = useRef(false);
  const hasLoggedCriticalRef = useRef(false);
  const prevAppReadyRef = useRef(appReady);
  // BOOT INVARIANT: forceDefaults executes only once (guard against repeated calls)
  const didForceDefaultsRef = useRef(false);

  // Boot stuck state for UI banner (Fix 2)
  // Two-phase: isBootSlow (5s) shows "waking up", isBootStuck (10s) shows critical
  const [isBootSlow, setIsBootSlow] = useState(false);
  const [isBootStuck, setIsBootStuck] = useState(false);

  // Detailed boot status for debugging
  const bootStatus = useMemo(() => ({
    authInitialized,
    subscriptionResolved,
    tierResolved,
    tierSource,
    filtersReady,
    filtersDefaulted,
    publicReady,
    proReady,
    appReady,
  }), [authInitialized, subscriptionResolved, tierResolved, tierSource, filtersReady, filtersDefaulted, publicReady, proReady, appReady]);

  /**
   * Build telemetry payload for boot stuck events
   * Structured for potential remote logging (Sentry, LogRocket, etc.)
   */
  const buildTelemetryPayload = () => {
    const elapsed = Date.now() - bootStartRef.current;
    const blockedBy = [];
    if (!authInitialized) blockedBy.push('auth');
    if (!subscriptionResolved) blockedBy.push('subscription');
    if (!tierResolved) blockedBy.push('tier_unknown');
    if (!filtersReady) blockedBy.push('filters');

    return {
      event: 'boot_stuck',
      elapsed_ms: elapsed,
      blocked_by: blockedBy,
      flags: {
        auth_initialized: authInitialized,
        subscription_ready: subscriptionResolved,
        tier_resolved: tierResolved,
        tier_source: tierSource,
        using_cached_tier: usingCachedTier,
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
        console.warn(`[AppReady] ✓ Boot complete in ${bootDuration}ms`);
      }
      // Reset flags for potential page navigation
      hasLoggedWarningRef.current = false;
      hasLoggedCriticalRef.current = false;
      setIsBootSlow(false); // Reset slow state on boot completion
      setIsBootStuck(false); // Reset stuck state on boot completion
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

    // Show "waking up" banner at 5s (before critical)
    const slowTimeoutId = setTimeout(() => {
      if (!appReady) {
        setIsBootSlow(true); // Show "Backend may be waking up" banner
      }
    }, BOOT_SLOW_THRESHOLD_MS);

    const criticalTimeoutId = setTimeout(() => {
      if (!hasLoggedCriticalRef.current && !appReady) {
        hasLoggedCriticalRef.current = true;
        setIsBootStuck(true); // Expose for BootStuckBanner UI
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
      clearTimeout(slowTimeoutId);
      clearTimeout(criticalTimeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- buildTelemetryPayload is stable
  }, [appReady, authInitialized, subscriptionResolved, tierResolved, filtersReady]);

  // Force filter defaults when boot is stuck due to hydration failure
  // BOOT INVARIANT: forceDefaults executes only once (didForceDefaultsRef guard)
  useEffect(() => {
    if (isBootStuck && !filtersReady && !filtersDefaulted && !didForceDefaultsRef.current) {
      didForceDefaultsRef.current = true;
      console.warn('[AppReady] Boot stuck due to filter hydration, forcing defaults');
      forceDefaults();
    }
  }, [isBootStuck, filtersReady, filtersDefaulted, forceDefaults]);

  // Log boot state changes (dev only)
  // User requirement: Print 3 key values on boot state changes
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Only log when appReady changes or during boot phase
      if (prevAppReadyRef.current !== appReady || !appReady) {
        // Key debug values: tokenStatus, subscriptionStatus, publicReady/proReady
        console.warn('[AppReady] Boot status:', {
          // 3 key values for debugging auth issues
          tokenStatus,
          subscriptionStatus,
          'publicReady/proReady': `${publicReady}/${proReady}`,
          tier,
          tierSource,
          usingCachedTier,
          // Full status
          ...bootStatus,
          elapsed: `${Date.now() - bootStartRef.current}ms`,
        });
      }
      prevAppReadyRef.current = appReady;
    }
  }, [bootStatus, appReady, tokenStatus, subscriptionStatus, publicReady, proReady, tier, tierSource, usingCachedTier]);

  // Expose debug info on window for DevTools console access
  // Gated: development mode OR ?__debug query param (for prod debugging)
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    const hasDebugParam = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('__debug');

    if (!isDev && !hasDebugParam) return;

    window.__APP_READY_DEBUG__ = {
      get status() {
        return {
          // 3 KEY DEBUG VALUES (for cold start debugging)
          tokenStatus,
          subscriptionStatus,
          tier,
          tierSource,
          usingCachedTier,
          // Progressive gates
          appReady,
          publicReady,
          proReady,
          subscriptionResolved,
          // Individual flags
          authInitialized,
          tierResolved,
          filtersReady,
          filtersDefaulted,
          isBootSlow,
          isBootStuck,
          bootElapsed: `${Date.now() - bootStartRef.current}ms`,
          // NOTE: Does NOT expose tokens or sensitive data
        };
      },
    };

    return () => {
      delete window.__APP_READY_DEBUG__;
    };
  }, [appReady, publicReady, proReady, subscriptionResolved, authInitialized, tierResolved, tierSource, usingCachedTier, filtersReady, filtersDefaulted, isBootSlow, isBootStuck, tokenStatus, subscriptionStatus, tier]);

  const bootPhase = appReady
    ? 'ready'
    : isBootStuck
      ? 'stuck'
      : isBootSlow
        ? 'slow'
        : subscriptionStatus === 'error'
          ? 'error'
          : 'booting';

  const value = useMemo(() => ({
    publicReady,
    proReady,
    bootStatus: bootPhase,
    banners: {
      usingCachedTier,
    },
    debug: import.meta.env.DEV ? {
      authInitialized,
      filtersReady,
      filtersDefaulted,
      subscriptionResolved,
      tierSource,
    } : undefined,
  }), [publicReady, proReady, bootPhase, usingCachedTier, authInitialized, filtersReady, filtersDefaulted, subscriptionResolved, tierSource]);

  return (
    <AppReadyContext.Provider value={value}>
      {children}
    </AppReadyContext.Provider>
  );
}

export default AppReadyContext;
