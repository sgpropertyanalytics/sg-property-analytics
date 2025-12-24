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

export function SubscriptionProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [subscription, setSubscription] = useState({
    tier: 'free',
    subscribed: false,
    ends_at: null,
  });
  const [loading, setLoading] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Fetch subscription status from backend when user changes
  useEffect(() => {
    const fetchSubscription = async () => {
      if (!isAuthenticated) {
        setSubscription({ tier: 'free', subscribed: false, ends_at: null });
        return;
      }

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
        // If endpoint doesn't exist yet or fails, default to free
        console.warn('Failed to fetch subscription status:', err.message);
        setSubscription({ tier: 'free', subscribed: false, ends_at: null });
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [isAuthenticated, user?.email]);

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

  // Show the pricing modal/paywall
  const showPaywall = useCallback(() => {
    setShowPricingModal(true);
  }, []);

  // Hide the pricing modal
  const hidePaywall = useCallback(() => {
    setShowPricingModal(false);
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
