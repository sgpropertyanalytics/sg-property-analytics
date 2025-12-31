import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import apiClient from '../api/client';
import { useStaleRequestGuard } from '../hooks';

/**
 * Subscription Context
 *
 * Manages subscription state for the freemium model.
 * Provides isPremium flag and showPaywall() method for triggering the pricing modal.
 *
 * Usage:
 * const { isPremium, showPaywall } = useSubscription();
 *
 * if (!isPremium) {
 *   return <BlurredData onClick={showPaywall} />;
 * }
 */

const SubscriptionContext = createContext(null);

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

// Cache key for localStorage
const SUBSCRIPTION_CACHE_KEY = 'subscription_cache';

// Cache version - bump this to invalidate all existing caches on deploy
// This ensures stale 'free' caches are cleared for all users automatically
const CACHE_VERSION = 3;

// Get cached subscription from localStorage (instant, no flicker)
const getCachedSubscription = () => {
  try {
    const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Version check - invalidate stale caches from older versions
      if (parsed.version !== CACHE_VERSION) {
        localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
        return null; // Force fresh fetch
      }
      // Basic validation
      if (parsed.tier && typeof parsed.subscribed === 'boolean') {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null; // Return null to indicate no valid cache (will fetch fresh)
};

// Save subscription to localStorage with version
const cacheSubscription = (sub) => {
  try {
    localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify({
      ...sub,
      version: CACHE_VERSION,
    }));
  } catch {
    // Ignore storage errors
  }
};

/**
 * Default subscription state
 *
 * P0 CONSTRAINT: tier='unknown' is a FIRST-CLASS LOADING STATE
 * - 'unknown' means "we don't know yet" (NOT free, NOT premium)
 * - UI must show skeleton when tier='unknown' (NOT blur/paywall)
 * - NEVER resolve to 'free' as a default/fallback
 * - Only set to 'free' when backend EXPLICITLY returns free
 */
const DEFAULT_SUBSCRIPTION = { tier: 'unknown', subscribed: false, ends_at: null };

/**
 * Subscription status quad-state:
 * - 'pending': Not yet determined (boot phase, waiting for auth/token)
 * - 'loading': API call in flight
 * - 'resolved': Subscription status EXPLICITLY known from backend
 * - 'error': Fetch failed (non-abort)
 *
 * P0 CONSTRAINTS:
 * - Abort is transient → stay in current state (pending/loading), NOT error
 * - Non-abort error → set 'error' status, NOT 'free' tier
 * - NEVER resolve to 'free' unless backend explicitly returns free
 */
const SubscriptionStatus = {
  PENDING: 'pending',   // Initial boot - don't know anything yet
  LOADING: 'loading',   // API call in flight
  RESOLVED: 'resolved', // Status EXPLICITLY known from backend (free or premium)
  ERROR: 'error',       // Fetch failed (non-abort) - show error state, NOT free
};

// Max manual retries to prevent 401 spam loops
const MAX_MANUAL_RETRIES = 2;

// Timeout for subscription fetch (prevents infinite pending)
const SUBSCRIPTION_FETCH_TIMEOUT_MS = 15000;

/**
 * Unwrap API response envelope.
 * Backend returns {data: {...}, meta: {...}} but axios wraps that in response.data.
 * So response.data = {data: {...}, meta: {...}}.
 * We need the inner data object.
 *
 * @param {Object} responseData - The axios response.data (which contains the API envelope)
 * @returns {Object|null} The subscription data or null if unparseable
 */
export const unwrapSubscriptionResponse = (responseData) => {
  // Handle enveloped response: {data: {tier, subscribed, ...}, meta: {...}}
  if (responseData?.data && typeof responseData.data === 'object' && 'tier' in responseData.data) {
    return responseData.data;
  }
  // Handle flat response (legacy or direct): {tier, subscribed, ...}
  if (responseData && 'tier' in responseData) {
    return responseData;
  }
  // Unknown format - return null to trigger default
  console.warn('[Subscription] Unknown response format:', responseData);
  return null;
};

export function SubscriptionProvider({ children }) {
  // P0 FIX: Use tokenStatus from AuthContext to wait for token availability
  const { user, isAuthenticated, initialized, refreshToken, tokenStatus, tokenReady } = useAuth();
  // Initialize from cache to prevent flash of unknown→premium
  // If no valid cache, start with 'unknown' tier (loading state)
  const [subscription, setSubscription] = useState(() => getCachedSubscription() || DEFAULT_SUBSCRIPTION);
  const [loading, setLoading] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Quad-state status for boot synchronization
  // Start as PENDING - we don't know anything until auth AND token are ready
  const [status, setStatus] = useState(SubscriptionStatus.PENDING);

  // Track fetch errors for UI display
  const [fetchError, setFetchError] = useState(null);

  // Abort/stale request protection
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // P1 FIX: Removed retryCount auto-retry. API client interceptor handles transient failures.
  // Manual retry state (for BootStuckBanner user-initiated recovery only)
  const [manualAttempt, setManualAttempt] = useState(0); // Nonce to trigger fetch
  const [manualRetryCount, setManualRetryCount] = useState(0); // Count for retry cap
  const attemptIdRef = useRef(0); // Track current attempt for stale closure prevention

  // Analytics context for upsell tracking
  // Tracks which field/source triggered the paywall
  const [upsellContext, setUpsellContext] = useState({
    field: null,    // e.g., "project name", "price", "PSF"
    source: null,   // e.g., "table", "modal", "chart"
    district: null, // e.g., "D09" for contextual copy
  });

  // Fetch subscription status from backend when user/token changes
  // P0 FIX: Wait for BOTH initialized AND tokenReady before fetching
  useEffect(() => {
    const requestId = startRequest();
    // Bump attempt ID to detect stale closures in timeout
    attemptIdRef.current += 1;
    const attemptId = attemptIdRef.current;

    const fetchSubscription = async () => {
      // Debug logging for subscription state tracking
      console.log('[Subscription] Fetch triggered:', {
        initialized,
        isAuthenticated,
        tokenStatus,
        tokenReady,
        hasToken: !!localStorage.getItem('token'),
        cachedSub: getCachedSubscription(),
        status,
        manualAttempt,
        attemptId,
      });

      // P0 FIX: Don't fetch until auth is fully initialized
      if (!initialized) {
        console.log('[Subscription] Waiting for auth initialization...');
        // Stay in PENDING state - can't determine anything yet
        return;
      }

      // Not authenticated → explicitly resolve as free (this IS explicit, not default)
      if (!isAuthenticated) {
        // Guard: Don't update state if stale
        if (isStale(requestId)) return;
        // Set to free EXPLICITLY (user is logged out)
        setSubscription({ tier: 'free', subscribed: false, ends_at: null });
        setStatus(SubscriptionStatus.RESOLVED);
        setFetchError(null);
        console.log('[Subscription] Not authenticated, EXPLICITLY resolved as free');
        // DON'T cache 'free' on logout - prevents stale cache persisting across sessions
        return;
      }

      // P0 FIX: Wait for token to be ready, but allow ERROR to proceed (for manual retry)
      // tokenStatus: 'present' | 'missing' | 'refreshing' | 'error'
      // Wait on: MISSING, REFRESHING (token not yet available)
      // Proceed on: PRESENT (normal), ERROR (allows manual retry to break deadlock)
      if (tokenStatus === 'missing' || tokenStatus === 'refreshing') {
        console.log('[Subscription] Waiting for token...', { tokenStatus });
        // Stay in PENDING state - do NOT resolve as free
        // Charts should show skeleton
        return;
      }

      // Token is ready - proceed with fetch
      setLoading(true);
      setStatus(SubscriptionStatus.LOADING);
      setFetchError(null);

      // Helper to fetch subscription
      const fetchSub = async () => {
        const response = await apiClient.get('/auth/subscription', {
          signal: getSignal(),
        });
        return response;
      };

      // BOOT EXCEPTION (DO NOT GENERALIZE):
      // Inline refresh is allowed ONLY here because this runs before hooks mount.
      // Rules:
      // 1) refresh-at-most-once per boot fetch
      // 2) retry-at-most-once for /auth/subscription
      // 3) no generic retry loops here (retry lives in api client for GETs)
      // 4) if refresh fails or 401 persists -> treat as unauthenticated
      let didRefresh = false;

      try {
        let response;
        try {
          console.log('[Subscription] Fetching /auth/subscription...');
          response = await fetchSub();
          console.log('[Subscription] Fetch success, status:', response.status);
        } catch (fetchErr) {
          console.error('[Subscription] Fetch error:', {
            status: fetchErr.response?.status,
            message: fetchErr.message,
            data: fetchErr.response?.data,
          });
          // On 401, try refreshing the token once and retry (refresh-once + retry-once)
          if (fetchErr.response?.status === 401 && refreshToken && !didRefresh) {
            didRefresh = true;
            console.warn('[Subscription] Got 401, attempting token refresh (once)...');
            const result = await refreshToken();
            console.log('[Subscription] Token refresh after 401:', result);
            if (result?.ok && result?.tokenStored && !isStale(requestId)) {
              // Token refreshed successfully, retry the fetch (once)
              console.log('[Subscription] Retrying after token refresh (once)...');
              try {
                response = await fetchSub();
              } catch (retryErr) {
                // Second 401 after refresh -> treat as unauthenticated
                if (retryErr.response?.status === 401) {
                  console.warn('[Subscription] 401 persists after refresh, treating as unauthenticated');
                  if (!isStale(requestId)) {
                    setSubscription({ tier: 'free', subscribed: false, ends_at: null });
                    setStatus(SubscriptionStatus.RESOLVED);
                    setLoading(false);
                  }
                  return;
                }
                throw retryErr;
              }
            } else {
              console.error('[Subscription] Token refresh failed on 401 retry:', result?.reason);
              throw fetchErr; // Re-throw if refresh failed
            }
          } else {
            throw fetchErr;
          }
        }

        // Guard: Don't update state if stale
        if (isStale(requestId)) return;

        // Reset retry count on success
        setRetryCount(0);

        // Unwrap enveloped response: {data: {tier, ...}, meta: {...}}
        const subData = unwrapSubscriptionResponse(response.data);
        if (subData) {
          const newSub = {
            tier: subData.tier || 'free',
            subscribed: subData.subscribed || false,
            ends_at: subData.ends_at || null,
          };
          // Log full response including debug fields
          console.log('[Subscription] API response received:', {
            ...newSub,
            _debug_user_id: subData._debug_user_id,
            _debug_email: subData._debug_email,
          });
          setSubscription(newSub);
          cacheSubscription(newSub); // Cache for instant load next time
          setStatus(SubscriptionStatus.RESOLVED);
          setLoading(false);
        } else {
          console.error('[Subscription] Failed to parse response:', response.data);
          // Parse failure → set error status (not free)
          setFetchError(new Error('Failed to parse subscription response'));
          setStatus(SubscriptionStatus.ERROR);
          setLoading(false);
        }
      } catch (err) {
        // Abort is intentional (filter change, unmount) - just return silently
        // P1 FIX: Removed auto-retry on abort. API client interceptor handles transient failures.
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          console.log('[Subscription] Fetch aborted (intentional)');
          return;
        }

        // Guard: Check stale after error
        if (isStale(requestId)) return;

        // P0 FIX: Non-abort error → set ERROR status, NOT free
        // Keep the existing cached value (if any) but mark status as error
        console.warn('[Subscription] Fetch failed (non-abort), setting ERROR status:', err.message);
        setFetchError(err);
        setStatus(SubscriptionStatus.ERROR);
        setLoading(false);
        // DO NOT: setSubscription({ tier: 'free' }) - keep cached value if any
      }
    };

    fetchSubscription();
  // Include tokenStatus + manualAttempt in deps to re-trigger when token becomes ready or manual retry
  // P1 FIX: Removed retryCount - API client interceptor handles transient failures
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, isAuthenticated, tokenStatus, user?.email, manualAttempt, startRequest, isStale, getSignal, refreshToken]);

  // Timeout: Prevent infinite pending state
  // Resets on every new fetch attempt (auto-retry or manual)
  useEffect(() => {
    // Only run timeout when in PENDING or LOADING state AND authenticated
    if (!isAuthenticated) return;
    if (status !== SubscriptionStatus.PENDING && status !== SubscriptionStatus.LOADING) {
      return;
    }

    // Capture current attempt ID for stale closure check
    const currentAttemptId = attemptIdRef.current;

    const timeoutId = setTimeout(() => {
      // Only set ERROR if this is still the current attempt
      if (currentAttemptId !== attemptIdRef.current) {
        console.log('[Subscription] Timeout ignored (stale attempt)');
        return;
      }
      console.error('[Subscription] Fetch timed out after 15s');
      setStatus(SubscriptionStatus.ERROR);
      setFetchError(new Error('Subscription fetch timed out'));
      // NOTE: Do NOT setLoading(false) - loading derived from status
      // DO NOT set tier to free - keep cached value or 'unknown'
    }, SUBSCRIPTION_FETCH_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [status, isAuthenticated, manualAttempt]); // Resets on manual retry

  // Manual retry for subscription (called by BootStuckBanner)
  // Note: Bumps manualAttempt nonce + tracks count for cap. Does NOT touch tier.
  const retrySubscription = useCallback(() => {
    if (!isAuthenticated) {
      console.warn('[Subscription] Cannot retry - not authenticated');
      return;
    }
    if (manualRetryCount >= MAX_MANUAL_RETRIES) {
      console.warn('[Subscription] Max manual retries reached');
      return;
    }
    console.log('[Subscription] Manual retry triggered');
    // Clear error and bump both nonce + count
    setFetchError(null);
    setManualRetryCount(prev => prev + 1);
    setManualAttempt(prev => prev + 1); // Triggers fetch effect
    // DO NOT set tier here - let the fetch effect handle it
  }, [isAuthenticated, manualRetryCount]);

  // Derived state: is tier known (not in 'unknown' loading state)?
  // P0 CONSTRAINT: 'unknown' tier is a FIRST-CLASS LOADING STATE
  // - 'unknown' means "we don't know yet" (NOT free, NOT premium)
  // - UI must show skeleton when tier='unknown' (NOT blur/paywall)
  const isTierKnown = useMemo(() => subscription.tier !== 'unknown', [subscription.tier]);

  // Derived state: is user a premium subscriber?
  // P0 CONSTRAINT: isPremium MUST be false when tier is 'unknown'
  // This prevents premium gating logic from treating 'unknown' as non-premium (would show blur)
  const isPremium = useMemo(() => {
    // CRITICAL: If tier is unknown, return false but UI should NOT show blur/paywall
    // The isTierKnown flag tells UI to show skeleton instead
    if (!isTierKnown) return false;
    if (subscription.tier === 'free') return false;
    if (!subscription.subscribed) return false;

    // Check if subscription has expired
    if (subscription.ends_at) {
      const endsAt = new Date(subscription.ends_at);
      if (endsAt < new Date()) return false;
    }

    return true;
  }, [isTierKnown, subscription]);

  // Days until subscription expires (null if not premium or no end date)
  const daysUntilExpiry = useMemo(() => {
    if (!isPremium || !subscription.ends_at) return null;
    const endsAt = new Date(subscription.ends_at);
    const diff = endsAt - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [isPremium, subscription.ends_at]);

  // Is subscription expiring soon (within 7 days)?
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7;

  // Show the pricing modal/paywall with optional analytics context
  // Usage: showPaywall() or showPaywall({ field: 'price', source: 'table', district: 'D09' })
  const showPaywall = useCallback((context = {}) => {
    setUpsellContext({
      field: context.field || null,
      source: context.source || null,
      district: context.district || null,
    });
    setShowPricingModal(true);
  }, []);

  // Hide the pricing modal and reset context
  const hidePaywall = useCallback(() => {
    setShowPricingModal(false);
    // Reset context after a delay to allow exit animations
    setTimeout(() => {
      setUpsellContext({ field: null, source: null, district: null });
    }, 300);
  }, []);

  // Refresh subscription status (call after successful payment)
  const refreshSubscription = useCallback(async () => {
    if (!isAuthenticated) return;

    const requestId = startRequest();
    setLoading(true);

    try {
      const response = await apiClient.get('/auth/subscription', {
        signal: getSignal(),
      });

      // Guard: Don't update state if stale
      if (isStale(requestId)) return;

      // Unwrap enveloped response: {data: {tier, ...}, meta: {...}}
      const subData = unwrapSubscriptionResponse(response.data);
      if (subData) {
        const newSub = {
          tier: subData.tier || 'free',
          subscribed: subData.subscribed || false,
          ends_at: subData.ends_at || null,
        };
        setSubscription(newSub);
        cacheSubscription(newSub);
      }
    } catch (err) {
      // CRITICAL: Never treat abort/cancel as a real error
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }

      // Guard: Check stale after error
      if (isStale(requestId)) return;

      console.error('Failed to refresh subscription:', err);
    } finally {
      // Only clear loading if not stale
      if (!isStale(requestId)) {
        setLoading(false);
      }
    }
  }, [isAuthenticated, startRequest, isStale, getSignal]);

  // Derived: is subscription status resolved? (boot synchronization)
  // Charts should wait for this before fetching
  // Note: ERROR also unblocks boot to allow retry, but isTierKnown remains false
  const isSubscriptionReady = status === SubscriptionStatus.RESOLVED || status === SubscriptionStatus.ERROR;

  const value = useMemo(() => ({
    // State
    subscription,
    isPremium,
    isTierKnown, // P0: true when tier is NOT 'unknown' (loading state)
    loading,
    daysUntilExpiry,
    isExpiringSoon,
    status, // Quad-state: 'pending' | 'loading' | 'resolved' | 'error'
    isSubscriptionReady, // True when subscription status is RESOLVED from backend
    fetchError, // Non-null if fetch failed (non-abort)

    // Paywall modal
    showPricingModal,
    showPaywall,
    hidePaywall,
    upsellContext, // Analytics context for pricing modal

    // Actions
    refreshSubscription,
    retrySubscription, // Manual retry (for BootStuckBanner)
    setSubscription, // For use after Firebase sync
  }), [
    subscription,
    isPremium,
    isTierKnown,
    loading,
    daysUntilExpiry,
    isExpiringSoon,
    status,
    isSubscriptionReady,
    fetchError,
    showPricingModal,
    showPaywall,
    hidePaywall,
    upsellContext,
    refreshSubscription,
    retrySubscription,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export default SubscriptionContext;
