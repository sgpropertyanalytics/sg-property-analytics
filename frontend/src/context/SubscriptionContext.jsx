import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import apiClient from '../api/client';
import { useStaleRequestGuard } from '../hooks';

/**
 * Subscription Context (Entitlement-Only)
 *
 * Manages subscription/entitlement state for the freemium model.
 * Provides isPremium flag and showPaywall() method for triggering the pricing modal.
 *
 * ARCHITECTURE:
 * - This context is ENTITLEMENT-ONLY - it does not manage auth state
 * - AuthContext owns auth state and PUSHES subscription data here
 * - SubscriptionProvider wraps AuthProvider (so AuthContext can call useSubscription)
 * - 401/logout handling is driven by AuthContext (calls clearSubscription)
 *
 * TIER MODEL:
 * - tier: 'free' | 'premium' (binary, no 'unknown')
 * - status: 'pending' | 'loading' | 'resolved' | 'error'
 * - Default tier is 'free', but UI MUST check isResolved before gating
 *
 * UI GATING RULES (CRITICAL):
 * - isPending: Show loading/skeleton (NEVER paywall/blur)
 * - isFreeResolved: Show paywall/blur
 * - isPremiumResolved: Show premium content
 * - NEVER use !isPremium to show paywall (would paywall during pending)
 *
 * AuthContext Integration:
 * - bootstrapSubscription(sub) - after firebase-sync returns subscription
 * - fetchSubscription() - on page refresh when token is ready
 * - clearSubscription() - on logout or 401 token failure
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
const CACHE_VERSION = 4;

// Get cached subscription from localStorage
const getCachedSubscription = () => {
  try {
    const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.version !== CACHE_VERSION) {
        localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
        return null;
      }
      if ((parsed.tier === 'free' || parsed.tier === 'premium') && typeof parsed.subscribed === 'boolean') {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
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

// Default subscription: tier='free', but status='pending' means not resolved yet
const DEFAULT_SUBSCRIPTION = { tier: 'free', subscribed: false, ends_at: null };

/**
 * Subscription status quad-state:
 * - 'pending': Not yet resolved (UI shows loading, NOT paywall)
 * - 'loading': API call in flight
 * - 'resolved': Subscription status EXPLICITLY known from backend
 * - 'error': Fetch/parse failed
 */
export const SubscriptionStatus = {
  PENDING: 'pending',
  LOADING: 'loading',
  RESOLVED: 'resolved',
  ERROR: 'error',
};

/**
 * Unwrap API response envelope.
 * Returns { tier, subscribed, ends_at } or null on error.
 * Does NOT fallback to 'free' - caller must set ERROR status on null.
 */
export const unwrapSubscriptionResponse = (responseData) => {
  // Handle enveloped response: {data: {tier, subscribed, ...}, meta: {...}}
  if (responseData?.data && typeof responseData.data === 'object' && 'tier' in responseData.data) {
    const { tier, subscribed, ends_at } = responseData.data;
    if (tier === 'free' || tier === 'premium') {
      return { tier, subscribed: subscribed || false, ends_at: ends_at || null };
    }
    return null;
  }
  // Handle flat response (legacy): {tier, subscribed, ...}
  if (responseData && 'tier' in responseData) {
    const { tier, subscribed, ends_at } = responseData;
    if (tier === 'free' || tier === 'premium') {
      return { tier, subscribed: subscribed || false, ends_at: ends_at || null };
    }
    return null;
  }
  console.warn('[Subscription] Unknown response format:', responseData);
  return null;
};

export function SubscriptionProvider({ children }) {
  // Initialize from cache OR default (tier='free' but status='pending')
  const cachedSub = getCachedSubscription();
  const [subscription, setSubscription] = useState(cachedSub || DEFAULT_SUBSCRIPTION);
  // If cached, start as RESOLVED; otherwise PENDING
  const [status, setStatus] = useState(cachedSub ? SubscriptionStatus.RESOLVED : SubscriptionStatus.PENDING);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Abort/stale request protection
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Ref for hidePaywall timeout cleanup
  const hidePaywallTimeoutRef = useRef(null);

  // Analytics context for upsell tracking
  const [upsellContext, setUpsellContext] = useState({
    field: null,
    source: null,
    district: null,
  });

  /**
   * Bootstrap subscription from AuthContext (primary path - no API call)
   * Called after firebase-sync returns subscription data.
   */
  const bootstrapSubscription = useCallback((sub) => {
    if (!sub || (sub.tier !== 'free' && sub.tier !== 'premium')) {
      console.error('[Subscription] Bootstrap called with invalid tier:', sub?.tier);
      setFetchError(new Error(`Invalid tier value: ${sub?.tier}`));
      setStatus(SubscriptionStatus.ERROR);
      return;
    }
    console.log('[Subscription] Bootstrapping:', sub);
    const newSub = {
      tier: sub.tier,
      subscribed: sub.subscribed || false,
      ends_at: sub.ends_at || null,
    };
    setSubscription(newSub);
    cacheSubscription(newSub);
    setStatus(SubscriptionStatus.RESOLVED);
    setLoading(false);
    setFetchError(null);
  }, []);

  /**
   * Fetch subscription from backend
   * Called by AuthContext on page refresh when no firebase-sync occurs.
   * No early-exit check - AuthContext decides when to call.
   *
   * RACE GUARD: Checks token at start AND after fetch to prevent overwriting
   * clearSubscription() state if logout happened during the request.
   */
  const fetchSubscription = useCallback(async () => {
    // Race guard: If no token, user logged out - don't fetch
    if (!localStorage.getItem('token')) {
      console.log('[Subscription] No token, skipping fetch');
      return;
    }

    const requestId = startRequest();
    console.log('[Subscription] Fetching /auth/subscription...');
    setLoading(true);
    setStatus(SubscriptionStatus.LOADING);
    setFetchError(null);

    try {
      const response = await apiClient.get('/auth/subscription', {
        signal: getSignal(),
      });

      if (isStale(requestId)) return;

      // Race guard: Re-check token after fetch (logout may have occurred during request)
      if (!localStorage.getItem('token')) {
        console.log('[Subscription] Token removed during fetch, discarding result');
        return;
      }

      const subData = unwrapSubscriptionResponse(response.data);
      if (subData) {
        console.log('[Subscription] Fetch success:', subData);
        setSubscription(subData);
        cacheSubscription(subData);
        setStatus(SubscriptionStatus.RESOLVED);
        setLoading(false);
      } else {
        console.error('[Subscription] Failed to parse response:', response.data);
        setFetchError(new Error('Failed to parse subscription response'));
        setStatus(SubscriptionStatus.ERROR);
        setLoading(false);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        console.log('[Subscription] Fetch aborted');
        return;
      }
      if (isStale(requestId)) return;

      console.error('[Subscription] Fetch error:', err.message);
      setFetchError(err);
      setStatus(SubscriptionStatus.ERROR);
      setLoading(false);
    }
  }, [startRequest, isStale, getSignal]);

  /**
   * Clear subscription (called on logout or 401)
   * Sets to free tier with RESOLVED status (explicit logout = explicit free)
   */
  const clearSubscription = useCallback(() => {
    console.log('[Subscription] Clearing (logout)');
    setSubscription({ tier: 'free', subscribed: false, ends_at: null });
    setStatus(SubscriptionStatus.RESOLVED);
    setLoading(false);
    setFetchError(null);
    // Don't cache on logout - prevents stale cache persisting
  }, []);

  /**
   * Refresh subscription from backend (after payment)
   * Forces a fresh fetch.
   */
  const refreshSubscription = useCallback(async () => {
    const requestId = startRequest();
    console.log('[Subscription] Refreshing...');
    setLoading(true);
    setStatus(SubscriptionStatus.LOADING);
    setFetchError(null);

    try {
      const response = await apiClient.get('/auth/subscription', {
        signal: getSignal(),
      });

      if (isStale(requestId)) return;

      const subData = unwrapSubscriptionResponse(response.data);
      if (subData) {
        console.log('[Subscription] Refresh success:', subData);
        setSubscription(subData);
        cacheSubscription(subData);
        setStatus(SubscriptionStatus.RESOLVED);
      } else {
        setFetchError(new Error('Failed to parse refresh response'));
        setStatus(SubscriptionStatus.ERROR);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      if (isStale(requestId)) return;
      console.error('[Subscription] Refresh error:', err.message);
      setFetchError(err);
      setStatus(SubscriptionStatus.ERROR);
    } finally {
      if (!isStale(requestId)) {
        setLoading(false);
      }
    }
  }, [startRequest, isStale, getSignal]);

  // ===== DERIVED STATE =====

  // Status checks
  const isResolved = status === SubscriptionStatus.RESOLVED;
  const isPending = status === SubscriptionStatus.PENDING || status === SubscriptionStatus.LOADING;
  const isError = status === SubscriptionStatus.ERROR;

  // Premium check with expiry validation
  const isPremiumActive = useMemo(() => {
    if (subscription.tier !== 'premium') return false;
    if (!subscription.subscribed) return false;
    if (subscription.ends_at) {
      const endsAt = new Date(subscription.ends_at);
      if (endsAt < new Date()) return false;
    }
    return true;
  }, [subscription]);

  // GATE CONDITIONS: Use these for paywall/blur/content gating
  // isFreeResolved: Show paywall/blur (ONLY when we KNOW user is free)
  const isFreeResolved = isResolved && !isPremiumActive;
  // isPremiumResolved: Show premium content (ONLY when we KNOW user is premium)
  const isPremiumResolved = isResolved && isPremiumActive;
  // isPremium: Alias for isPremiumResolved
  const isPremium = isPremiumResolved;

  // DEPRECATED - use isResolved
  const isTierKnown = isResolved;
  const isSubscriptionReady = isResolved || isError;

  const daysUntilExpiry = useMemo(() => {
    if (!isPremiumActive || !subscription.ends_at) return null;
    const endsAt = new Date(subscription.ends_at);
    const diff = endsAt - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [isPremiumActive, subscription.ends_at]);

  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7;

  // Paywall actions
  const showPaywall = useCallback((context = {}) => {
    setUpsellContext({
      field: context.field || null,
      source: context.source || null,
      district: context.district || null,
    });
    setShowPricingModal(true);
  }, []);

  const hidePaywall = useCallback(() => {
    setShowPricingModal(false);
    if (hidePaywallTimeoutRef.current) {
      clearTimeout(hidePaywallTimeoutRef.current);
    }
    hidePaywallTimeoutRef.current = setTimeout(() => {
      setUpsellContext({ field: null, source: null, district: null });
      hidePaywallTimeoutRef.current = null;
    }, 300);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hidePaywallTimeoutRef.current) {
        clearTimeout(hidePaywallTimeoutRef.current);
      }
    };
  }, []);

  const value = useMemo(() => ({
    // Raw state
    subscription,
    tier: subscription.tier,
    status,
    loading,
    fetchError,

    // GATE CONDITIONS (use these for paywall/blur/content gating)
    isResolved,       // True when status==='resolved' (safe to gate on tier)
    isPending,        // True when pending/loading (show skeleton, NOT paywall)
    isError,          // True when status==='error'
    isFreeResolved,   // True when resolved AND free (show paywall/blur)
    isPremiumResolved,// True when resolved AND premium (show premium content)
    isPremium,        // Alias for isPremiumResolved

    // DEPRECATED - use isResolved
    isTierKnown,
    isSubscriptionReady,

    // Expiry
    daysUntilExpiry,
    isExpiringSoon,

    // Paywall modal
    showPricingModal,
    showPaywall,
    hidePaywall,
    upsellContext,

    // Actions for AuthContext
    bootstrapSubscription,
    fetchSubscription,
    clearSubscription,
    refreshSubscription,
    setSubscription,
  }), [
    subscription,
    status,
    loading,
    fetchError,
    isResolved,
    isPending,
    isError,
    isFreeResolved,
    isPremiumResolved,
    isPremium,
    isTierKnown,
    isSubscriptionReady,
    daysUntilExpiry,
    isExpiringSoon,
    showPricingModal,
    showPaywall,
    hidePaywall,
    upsellContext,
    bootstrapSubscription,
    fetchSubscription,
    clearSubscription,
    refreshSubscription,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export default SubscriptionContext;
