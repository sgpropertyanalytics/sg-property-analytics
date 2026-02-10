import { describe, it, expect } from 'vitest';
import {
  AccessSource,
  deriveAccessSource,
  deriveCanAccessAuthenticated,
  deriveHasCachedAuthenticatedAccess,
  deriveIsAccessKnown,
} from '../accessDerivations';

describe('access derivations', () => {
  it('derives accessSource from status and cache presence', () => {
    expect(deriveAccessSource('resolved', false)).toBe(AccessSource.SERVER);
    expect(deriveAccessSource('degraded', true)).toBe(AccessSource.CACHE);
    expect(deriveAccessSource('degraded', false)).toBe(AccessSource.NONE);
    expect(deriveAccessSource('error', true)).toBe(AccessSource.NONE);
  });

  it('treats cache access as known', () => {
    expect(deriveIsAccessKnown(AccessSource.CACHE)).toBe(true);
    expect(deriveIsAccessKnown(AccessSource.NONE)).toBe(false);
  });

  it('allows cached authenticated access when active', () => {
    const accessState = { accessLevel: 'authenticated', subscribed: true, ends_at: null };
    const hasCachedAuthenticatedAccess = deriveHasCachedAuthenticatedAccess(AccessSource.CACHE, accessState, true);
    expect(hasCachedAuthenticatedAccess).toBe(true);
    expect(deriveCanAccessAuthenticated(false, hasCachedAuthenticatedAccess)).toBe(true);
  });

  it('does not allow access when source is unknown', () => {
    const accessSource = deriveAccessSource('pending', false);
    const hasCachedAuthenticatedAccess = deriveHasCachedAuthenticatedAccess(accessSource, null, false);
    expect(accessSource).toBe(AccessSource.NONE);
    expect(hasCachedAuthenticatedAccess).toBe(false);
    expect(deriveCanAccessAuthenticated(false, hasCachedAuthenticatedAccess)).toBe(false);
  });
});
