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

export function AccessProvider({ children }) {
  const { user, initialized, isAuthenticated } = useAuth();

  const refresh = useCallback(async () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);
  const clear = useCallback(() => {}, []);
  const ensure = useCallback(() => {}, []);

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
  }), [user, initialized, accessLevel, accessSource]);

  const value = useMemo(() => ({
    coordState,
    accessLevel,
    accessSource,
    status: 'ready',
    canAccessAuthenticated,
    actions: {
      refresh,
      clear,
      ensure,
    },
    debug: import.meta.env.DEV ? {
      accessReady: true,
      accessSource,
      model: 'authenticated-users-have-full-access',
    } : undefined,
  }), [coordState, accessLevel, accessSource, canAccessAuthenticated, refresh, clear, ensure]);

  return (
    <AccessContext.Provider value={value}>
      {children}
    </AccessContext.Provider>
  );
}
