export const AccessSource = {
  SERVER: 'server',
  CACHE: 'cache',
  NONE: 'none',
};

// Legacy alias (backward compatibility)
export const TierSource = AccessSource;

export const deriveAccessSource = (status, hasCachedSubscription) => {
  if (status === 'resolved') return AccessSource.SERVER;
  if (status === 'degraded' && hasCachedSubscription) return AccessSource.CACHE;
  return AccessSource.NONE;
};

// Legacy alias
export const deriveTierSource = deriveAccessSource;

export const deriveIsAccessKnown = (accessSource) => accessSource !== AccessSource.NONE;

// Legacy alias
export const deriveIsTierKnown = deriveIsAccessKnown;

export const deriveHasCachedAuthenticatedAccess = (accessSource, subscription, isAccessActive) => (
  accessSource === AccessSource.CACHE
  && (subscription?.accessLevel === 'authenticated' || subscription?.tier === 'premium')
  && isAccessActive
);

// Legacy alias
export const deriveHasCachedPremium = deriveHasCachedAuthenticatedAccess;

export const deriveCanAccessAuthenticated = (isAccessResolved, hasCachedAuthenticatedAccess) => (
  isAccessResolved || hasCachedAuthenticatedAccess
);

// Legacy alias
export const deriveCanAccessPremium = deriveCanAccessAuthenticated;
