export const AccessSource = {
  SERVER: 'server',
  CACHE: 'cache',
  NONE: 'none',
};

export const deriveAccessSource = (status, hasCachedAccess) => {
  if (status === 'resolved') return AccessSource.SERVER;
  if (status === 'degraded' && hasCachedAccess) return AccessSource.CACHE;
  return AccessSource.NONE;
};

export const deriveIsAccessKnown = (accessSource) => accessSource !== AccessSource.NONE;

export const deriveHasCachedAuthenticatedAccess = (accessSource, accessState, isAccessActive) => (
  accessSource === AccessSource.CACHE
  && accessState?.accessLevel === 'authenticated'
  && isAccessActive
);

export const deriveCanAccessAuthenticated = (isAccessResolved, hasCachedAuthenticatedAccess) => (
  isAccessResolved || hasCachedAuthenticatedAccess
);
