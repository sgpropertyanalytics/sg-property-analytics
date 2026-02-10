import { createContext, useContext, useReducer, useMemo, useCallback } from 'react';
import {
  authCoordinatorReducer,
  initialState as coordinatorInitialState,
} from './authCoordinator';

const SubscriptionContext = createContext(null);

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

const DEFAULT_SUBSCRIPTION = {
  accessLevel: 'authenticated',
  tier: 'free', // legacy alias
  subscribed: true,
  ends_at: null,
};

const INITIAL_COORD_STATE = {
  ...coordinatorInitialState,
  accessLevel: 'authenticated',
  accessSource: 'server',
  tier: 'free',
  tierSource: 'server',
  subPhase: 'resolved',
  cachedSubscription: DEFAULT_SUBSCRIPTION,
};

export const SubscriptionStatus = {
  PENDING: 'pending',
  LOADING: 'loading',
  RESOLVED: 'resolved',
  DEGRADED: 'degraded',
  ERROR: 'error',
};

const normalizeAccessLevel = (raw) => {
  if (raw === 'authenticated' || raw === 'anonymous' || raw === 'unknown') return raw;
  if (raw === 'premium' || raw === 'free') return 'authenticated';
  return null;
};

export const unwrapSubscriptionResponse = (responseData) => {
  if (!responseData || typeof responseData !== 'object') {
    return DEFAULT_SUBSCRIPTION;
  }

  const payload = responseData.data && typeof responseData.data === 'object'
    ? responseData.data
    : responseData;

  const rawAccessLevel = payload.accessLevel ?? payload.tier;
  const accessLevel = normalizeAccessLevel(rawAccessLevel);
  if (!accessLevel) {
    return DEFAULT_SUBSCRIPTION;
  }

  return {
    accessLevel,
    tier: payload.tier ?? (accessLevel === 'authenticated' ? 'free' : accessLevel),
    subscribed: payload.subscribed ?? accessLevel === 'authenticated',
    ends_at: payload.ends_at ?? null,
  };
};

export function SubscriptionProvider({ children }) {
  const [coordState, dispatch] = useReducer(authCoordinatorReducer, INITIAL_COORD_STATE);

  const refresh = useCallback(async () => {}, []);
  const clear = useCallback(() => {}, []);
  const ensure = useCallback(() => {}, []);

  const showPaywall = useCallback(() => {}, []);
  const hidePaywall = useCallback(() => {}, []);

  const canAccessAuthenticated = !!coordState.user;

  const value = useMemo(() => ({
    coordState,
    dispatch,
    accessLevel: 'authenticated',
    accessSource: coordState.user ? 'server' : 'none',
    // Legacy aliases
    tier: 'free',
    tierSource: coordState.user ? 'server' : 'none',
    status: 'ready',
    canAccessAuthenticated,
    canAccessPremium: canAccessAuthenticated, // legacy alias
    expiry: {
      endsAt: null,
      daysUntilExpiry: null,
      isExpiringSoon: false,
    },
    paywall: {
      isOpen: false,
      open: showPaywall,
      close: hidePaywall,
      upsellContext: { field: null, source: null, district: null },
    },
    actions: {
      refresh,
      clear,
      ensure,
    },
    debug: import.meta.env.DEV ? {
      subscription: DEFAULT_SUBSCRIPTION,
      status: SubscriptionStatus.RESOLVED,
      fetchError: null,
      subscriptionReady: true,
      accessSource: coordState.user ? 'server' : 'none',
      tierSource: coordState.user ? 'server' : 'none', // legacy alias
      hasCachedSubscription: false,
      model: 'authenticated-users-have-full-access',
    } : undefined,
  }), [coordState, canAccessAuthenticated, showPaywall, hidePaywall, refresh, clear, ensure]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
