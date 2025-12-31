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

// Default subscription state (used when no cache or cache invalid)
const DEFAULT_SUBSCRIPTION = { tier: 'free', subscribed: false, ends_at: null };

export function SubscriptionProvider({ children }) {
  const { user, isAuthenticated, initialized, refreshToken } = useAuth();
  // Initialize from cache to prevent flash of free→premium
  // If no valid cache, start with null to show loading state until API responds
  const [subscription, setSubscription] = useState(() => getCachedSubscription() || DEFAULT_SUBSCRIPTION);
  const [loading, setLoading] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Abort/stale request protection
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Analytics context for upsell tracking
  // Tracks which field/source triggered the paywall
  const [upsellContext, setUpsellContext] = useState({
    field: null,    // e.g., "project name", "price", "PSF"
    source: null,   // e.g., "table", "modal", "chart"
    district: null, // e.g., "D09" for contextual copy
  });

  // Fetch subscription status from backend when user changes
  // Wait for auth to be fully initialized (including JWT token sync)
  useEffect(() => {
    const requestId = startRequest();

    const fetchSubscription = async () => {
      // Debug logging for subscription state tracking
      console.log('[Subscription] Fetch triggered:', {
        initialized,
        isAuthenticated,
        hasToken: !!localStorage.getItem('token'),
        cachedSub: getCachedSubscription(),
      });

      // Don't fetch until auth is fully initialized (token sync complete)
      if (!initialized) {
        console.log('[Subscription] Waiting for auth initialization...');
        return;
      }

      if (!isAuthenticated) {
        // Guard: Don't update state if stale
        if (isStale(requestId)) return;
        setSubscription(DEFAULT_SUBSCRIPTION);
        // DON'T cache 'free' on logout - prevents stale cache persisting across sessions
        // Next login will fetch fresh subscription status from backend
        // cacheSubscription(freeSub);  // REMOVED: Was causing stale 'free' cache bug
        return;
      }

      // Ensure we have a token before fetching
      const token = localStorage.getItem('token');
      if (!token) {
        // CRITICAL FIX: When token is missing but user is authenticated (Firebase),
        // DON'T downgrade to free. Keep cached value and wait for token sync.
        // The AuthContext will re-sync with backend and restore the token.
        console.warn('[Subscription] No token available, keeping cached subscription');
        // Don't overwrite cached subscription - this prevents premium→free flicker
        // when token is temporarily missing during auth refresh
        return;
      }

      setLoading(true);

      // Helper to fetch subscription
      const fetchSub = async () => {
        const response = await apiClient.get('/auth/subscription', {
          signal: getSignal(),
        });
        return response;
      };

      try {
        let response;
        try {
          response = await fetchSub();
        } catch (fetchErr) {
          // On 401, try refreshing the token once and retry
          if (fetchErr.response?.status === 401 && refreshToken) {
            console.warn('[Subscription] Got 401, attempting token refresh...');
            const refreshed = await refreshToken();
            if (refreshed && !isStale(requestId)) {
              // Token refreshed successfully, retry the fetch
              response = await fetchSub();
            } else {
              throw fetchErr; // Re-throw if refresh failed
            }
          } else {
            throw fetchErr;
          }
        }

        // Guard: Don't update state if stale
        if (isStale(requestId)) return;

        if (response.data) {
          const newSub = {
            tier: response.data.tier || 'free',
            subscribed: response.data.subscribed || false,
            ends_at: response.data.ends_at || null,
          };
          console.log('[Subscription] API response received:', newSub);
          setSubscription(newSub);
          cacheSubscription(newSub); // Cache for instant load next time
        }
      } catch (err) {
        // CRITICAL: Never treat abort/cancel as a real error
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          return;
        }

        // Guard: Check stale after error
        if (isStale(requestId)) return;

        // CRITICAL FIX: On API failure, DO NOT overwrite cached subscription!
        // Keep the existing cached value to prevent premium→free downgrade from
        // temporary network issues, server cold starts, or API errors.
        // Only log the error - the cached subscription remains in state.
        console.warn('[Subscription] Failed to fetch status, keeping cached value:', err.message);
        // DO NOT: setSubscription(freeSub) or cacheSubscription(freeSub)
      } finally {
        // Only clear loading if not stale
        if (!isStale(requestId)) {
          setLoading(false);
        }
      }
    };

    fetchSubscription();
  }, [initialized, isAuthenticated, user?.email, startRequest, isStale, getSignal, refreshToken]);

  // Derived state: is user a premium subscriber?
  const isPremium = useMemo(() => {
    if (subscription.tier === 'free') return false;
    if (!subscription.subscribed) return false;

    // Check if subscription has expired
    if (subscription.ends_at) {
      const endsAt = new Date(subscription.ends_at);
      if (endsAt < new Date()) return false;
    }

    return true;
  }, [subscription]);

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

      if (response.data) {
        const newSub = {
          tier: response.data.tier || 'free',
          subscribed: response.data.subscribed || false,
          ends_at: response.data.ends_at || null,
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

  const value = useMemo(() => ({
    // State
    subscription,
    isPremium,
    loading,
    daysUntilExpiry,
    isExpiringSoon,

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
    loading,
    daysUntilExpiry,
    isExpiringSoon,
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
