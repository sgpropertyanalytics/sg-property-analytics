import { createContext, useContext, useReducer, useMemo, useCallback } from 'react';
import {
  authCoordinatorReducer,
  initialState as coordinatorInitialState,
} from './authCoordinator';

const AccessContext = createContext(null);

export function useAccess() {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error('useAccess must be used within an AccessProvider');
  }
  return context;
}

const DEFAULT_ACCESS = {
  accessLevel: 'authenticated',
  subscribed: true,
  ends_at: null,
};

const INITIAL_COORD_STATE = {
  ...coordinatorInitialState,
  accessLevel: 'authenticated',
  accessSource: 'server',
  accessPhase: 'resolved',
  cachedAccess: DEFAULT_ACCESS,
};

export const AccessStatus = {
  PENDING: 'pending',
  LOADING: 'loading',
  RESOLVED: 'resolved',
  DEGRADED: 'degraded',
  ERROR: 'error',
};

const normalizeAccessLevel = (raw) => {
  if (raw === 'authenticated' || raw === 'anonymous' || raw === 'unknown') return raw;
  return null;
};

export const unwrapAccessResponse = (responseData) => {
  if (!responseData || typeof responseData !== 'object') {
    return DEFAULT_ACCESS;
  }

  const payload = responseData.data && typeof responseData.data === 'object'
    ? responseData.data
    : responseData;

  const accessLevel = normalizeAccessLevel(payload.accessLevel);
  if (!accessLevel) {
    return DEFAULT_ACCESS;
  }

  return {
    accessLevel,
    subscribed: payload.subscribed ?? accessLevel === 'authenticated',
    ends_at: payload.ends_at ?? null,
  };
};

export function AccessProvider({ children }) {
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
    status: 'ready',
    canAccessAuthenticated,
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
      access: DEFAULT_ACCESS,
      status: AccessStatus.RESOLVED,
      fetchError: null,
      accessReady: true,
      accessSource: coordState.user ? 'server' : 'none',
      hasCachedAccess: false,
      model: 'authenticated-users-have-full-access',
    } : undefined,
  }), [coordState, canAccessAuthenticated, showPaywall, hidePaywall, refresh, clear, ensure]);

  return (
    <AccessContext.Provider value={value}>
      {children}
    </AccessContext.Provider>
  );
}
