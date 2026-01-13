export const TierSource = {
  SERVER: 'server',
  CACHE: 'cache',
  NONE: 'none',
};

export const deriveTierSource = (status, hasCachedSubscription) => {
  if (status === 'resolved') return TierSource.SERVER;
  if (status === 'degraded' && hasCachedSubscription) return TierSource.CACHE;
  return TierSource.NONE;
};

export const deriveIsTierKnown = (tierSource) => tierSource !== TierSource.NONE;

export const deriveHasCachedPremium = (tierSource, subscription, isPremiumActive) => (
  tierSource === TierSource.CACHE
  && subscription?.tier === 'premium'
  && isPremiumActive
);

export const deriveCanAccessPremium = (isPremiumResolved, hasCachedPremium) => (
  isPremiumResolved || hasCachedPremium
);
