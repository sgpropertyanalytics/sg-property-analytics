import { describe, it, expect } from 'vitest';
import {
  TierSource,
  deriveCanAccessPremium,
  deriveHasCachedPremium,
  deriveIsTierKnown,
  deriveTierSource,
} from '../subscriptionDerivations';

describe('subscription derivations', () => {
  it('derives tierSource from status and cache presence', () => {
    expect(deriveTierSource('resolved', false)).toBe(TierSource.SERVER);
    expect(deriveTierSource('degraded', true)).toBe(TierSource.CACHE);
    expect(deriveTierSource('degraded', false)).toBe(TierSource.NONE);
    expect(deriveTierSource('error', true)).toBe(TierSource.NONE);
  });

  it('treats cache tier as known', () => {
    expect(deriveIsTierKnown(TierSource.CACHE)).toBe(true);
    expect(deriveIsTierKnown(TierSource.NONE)).toBe(false);
  });

  it('allows cached premium access when active', () => {
    const subscription = { tier: 'premium', subscribed: true, ends_at: null };
    const hasCachedPremium = deriveHasCachedPremium(TierSource.CACHE, subscription, true);
    expect(hasCachedPremium).toBe(true);
    expect(deriveCanAccessPremium(false, hasCachedPremium)).toBe(true);
  });

  it('does not allow premium access when tier is unknown', () => {
    const tierSource = deriveTierSource('pending', false);
    const hasCachedPremium = deriveHasCachedPremium(tierSource, null, false);
    expect(tierSource).toBe(TierSource.NONE);
    expect(hasCachedPremium).toBe(false);
    expect(deriveCanAccessPremium(false, hasCachedPremium)).toBe(false);
  });
});
