import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import apiClient from '../api/client';

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

// Get cached subscription from localStorage (instant, no flicker)
const getCachedSubscription = () => {
  try {
    const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Basic validation
      if (parsed.tier && typeof parsed.subscribed === 'boolean') {
        return parsed;
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { tier: 'free', subscribed: false, ends_at: null };
};

// Save subscription to localStorage
const cacheSubscription = (sub) => {
  try {
    localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(sub));
  } catch (e) {
    // Ignore storage errors
  }
};

export function SubscriptionProvider({ children }) {
  const { user, isAuthenticated, initialized } = useAuth();
  // Initialize from cache to prevent flash of free→premium
  const [subscription, setSubscription] = useState(getCachedSubscription);
  const [loading, setLoading] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

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
    const fetchSubscription = async () => {
      // Don't fetch until auth is fully initialized (token sync complete)
      if (!initialized) {
        return;
      }

      if (!isAuthenticated) {
        const freeSub = { tier: 'free', subscribed: false, ends_at: null };
        setSubscription(freeSub);
        cacheSubscription(freeSub); // Clear cache on sign out
        return;
      }

      // Ensure we have a token before fetching
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('[Subscription] No token available, skipping fetch');
        setSubscription({ tier: 'free', subscribed: false, ends_at: null });
        return;
      }

      setLoading(true);
      try {
        const response = await apiClient.get('/auth/subscription');
        if (response.data) {
          const newSub = {
            tier: response.data.tier || 'free',
            subscribed: response.data.subscribed || false,
            ends_at: response.data.ends_at || null,
          };
          setSubscription(newSub);
          cacheSubscription(newSub); // Cache for instant load next time
        }
      } catch (err) {
        // If endpoint doesn't exist yet or fails, default to free
        console.warn('Failed to fetch subscription status:', err.message);
        const freeSub = { tier: 'free', subscribed: false, ends_at: null };
        setSubscription(freeSub);
        cacheSubscription(freeSub);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [initialized, isAuthenticated, user?.email]);

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

    setLoading(true);
    try {
      const response = await apiClient.get('/auth/subscription');
      if (response.data) {
        setSubscription({
          tier: response.data.tier || 'free',
          subscribed: response.data.subscribed || false,
          ends_at: response.data.ends_at || null,
        });
      }
    } catch (err) {
      console.error('Failed to refresh subscription:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const value = {
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
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export default SubscriptionContext;
