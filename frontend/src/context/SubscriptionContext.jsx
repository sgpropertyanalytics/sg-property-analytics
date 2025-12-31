import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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
const CACHE_VERSION = 2;

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

  // Retry counter for abort handling
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

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
        retryCount,
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

      // P0 FIX: Wait for token to be ready
      // tokenStatus: 'present' | 'missing' | 'refreshing' | 'error'
      if (tokenStatus !== 'present') {
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
        // P0 FIX: Abort is TRANSIENT - stay in current state, allow retry
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          console.log('[Subscription] Fetch aborted (transient), current retryCount:', retryCount);
          // Do NOT set RESOLVED or ERROR
          // Do NOT set subscription to free
          // Stay in PENDING/LOADING state
          // Increment retry count and schedule retry if under limit
          if (retryCount < MAX_RETRIES) {
            setRetryCount(prev => prev + 1);
            console.log('[Subscription] Will retry on next effect run');
          }
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
  // Include tokenStatus in deps to re-trigger when token becomes ready
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, isAuthenticated, tokenStatus, user?.email, retryCount, startRequest, isStale, getSignal, refreshToken]);

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
  const isSubscriptionReady = status === SubscriptionStatus.RESOLVED;

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
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export default SubscriptionContext;
