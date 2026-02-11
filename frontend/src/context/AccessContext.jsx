import { createContext, useContext, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';

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
  const { user, initialized, isAuthenticated } = useAuth();

  const refresh = useCallback(async () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);
  const clear = useCallback(() => {}, []);
  const ensure = useCallback(() => {}, []);

  const showPaywall = useCallback(() => {}, []);
  const hidePaywall = useCallback(() => {}, []);

  const canAccessAuthenticated = !!user;
  const accessSource = isAuthenticated ? 'server' : 'none';
  const accessLevel = isAuthenticated ? 'authenticated' : 'anonymous';
  const coordState = useMemo(() => ({
    user: user ?? null,
    initialized: !!initialized,
    accessLevel,
    accessSource,
    accessPhase: 'resolved',
    accessError: null,
    cachedAccess: isAuthenticated ? DEFAULT_ACCESS : null,
    accessRequestId: null,
  }), [user, initialized, accessLevel, accessSource, isAuthenticated]);

  const value = useMemo(() => ({
    coordState,
    dispatch: () => {}, // Compatibility stub for legacy test utilities.
    accessLevel,
    accessSource,
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
      accessSource,
      hasCachedAccess: false,
      model: 'authenticated-users-have-full-access',
    } : undefined,
  }), [coordState, accessLevel, accessSource, canAccessAuthenticated, showPaywall, hidePaywall, refresh, clear, ensure]);

  return (
    <AccessContext.Provider value={value}>
      {children}
    </AccessContext.Provider>
  );
}
