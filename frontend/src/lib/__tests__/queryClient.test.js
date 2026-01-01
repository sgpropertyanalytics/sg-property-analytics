/**
 * TanStack Query Client Configuration Tests
 *
 * Phase 2 of filter system simplification.
 *
 * Tests for:
 * 1. QueryClient configuration defaults
 * 2. Status derivation function (deriveQueryStatus)
 * 3. hasRealData utility function
 */

import { describe, it, expect } from 'vitest';

import {
  queryClient,
  QueryStatus,
  deriveQueryStatus,
  hasRealData,
} from '../queryClient';

// =============================================================================
// QUERY CLIENT CONFIGURATION TESTS
// =============================================================================

describe('QueryClient Configuration', () => {
  it('has correct staleTime default (30 seconds)', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
  });

  it('has correct gcTime default (5 minutes)', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.gcTime).toBe(5 * 60_000);
  });

  it('has retry set to 1', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(1);
  });

  it('has refetchOnWindowFocus disabled', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
  });

  it('has refetchOnReconnect enabled', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });

  it('has throwOnError disabled', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.throwOnError).toBe(false);
  });
});

// =============================================================================
// QUERY STATUS TESTS
// =============================================================================

describe('QueryStatus enum', () => {
  it('has all expected status values', () => {
    expect(QueryStatus.IDLE).toBe('idle');
    expect(QueryStatus.PENDING).toBe('pending');
    expect(QueryStatus.LOADING).toBe('loading');
    expect(QueryStatus.REFRESHING).toBe('refreshing');
    expect(QueryStatus.SUCCESS).toBe('success');
    expect(QueryStatus.ERROR).toBe('error');
  });
});

// =============================================================================
// DERIVE QUERY STATUS TESTS
// =============================================================================

describe('deriveQueryStatus', () => {
  it('returns IDLE when disabled', () => {
    const queryResult = {
      isPending: true,
      isFetching: false,
      isError: false,
      isSuccess: false,
    };

    expect(deriveQueryStatus(queryResult, false, false)).toBe(QueryStatus.IDLE);
  });

  it('returns ERROR when isError is true', () => {
    const queryResult = {
      isPending: false,
      isFetching: false,
      isError: true,
      isSuccess: false,
    };

    expect(deriveQueryStatus(queryResult, true, false)).toBe(QueryStatus.ERROR);
  });

  it('returns LOADING when isPending and isFetching (first load)', () => {
    const queryResult = {
      isPending: true,
      isFetching: true,
      isError: false,
      isSuccess: false,
    };

    expect(deriveQueryStatus(queryResult, true, false)).toBe(QueryStatus.LOADING);
  });

  it('returns REFRESHING when fetching with existing data', () => {
    const queryResult = {
      isPending: false,
      isFetching: true,
      isError: false,
      isSuccess: true,
    };

    expect(deriveQueryStatus(queryResult, true, true)).toBe(QueryStatus.REFRESHING);
  });

  it('returns LOADING when fetching without real data (initialData: [])', () => {
    const queryResult = {
      isPending: false,
      isFetching: true,
      isError: false,
      isSuccess: true,
    };

    // hasData = false means initialData was empty array
    expect(deriveQueryStatus(queryResult, true, false)).toBe(QueryStatus.LOADING);
  });

  it('returns SUCCESS when isSuccess and not fetching', () => {
    const queryResult = {
      isPending: false,
      isFetching: false,
      isError: false,
      isSuccess: true,
    };

    expect(deriveQueryStatus(queryResult, true, true)).toBe(QueryStatus.SUCCESS);
  });

  it('returns PENDING when isPending but not fetching', () => {
    const queryResult = {
      isPending: true,
      isFetching: false,
      isError: false,
      isSuccess: false,
    };

    expect(deriveQueryStatus(queryResult, true, false)).toBe(QueryStatus.PENDING);
  });

  it('ERROR takes precedence over other states', () => {
    const queryResult = {
      isPending: false,
      isFetching: true,  // Still fetching
      isError: true,     // But has error
      isSuccess: false,
    };

    expect(deriveQueryStatus(queryResult, true, true)).toBe(QueryStatus.ERROR);
  });
});

// =============================================================================
// HAS REAL DATA TESTS
// =============================================================================

describe('hasRealData', () => {
  describe('null/undefined handling', () => {
    it('returns false for null', () => {
      expect(hasRealData(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(hasRealData(undefined)).toBe(false);
    });
  });

  describe('array handling', () => {
    it('returns false for empty array', () => {
      expect(hasRealData([])).toBe(false);
    });

    it('returns true for non-empty array', () => {
      expect(hasRealData([1])).toBe(true);
      expect(hasRealData([1, 2, 3])).toBe(true);
      expect(hasRealData([{ foo: 'bar' }])).toBe(true);
    });
  });

  describe('object handling', () => {
    it('returns false for empty object', () => {
      expect(hasRealData({})).toBe(false);
    });

    it('returns true for non-empty object', () => {
      expect(hasRealData({ foo: 'bar' })).toBe(true);
      expect(hasRealData({ a: 1, b: 2 })).toBe(true);
    });

    it('returns true for class instances', () => {
      class MyClass {
        constructor() {
          this.value = 42;
        }
      }
      expect(hasRealData(new MyClass())).toBe(true);
    });
  });

  describe('primitive handling', () => {
    it('returns true for non-null primitives', () => {
      expect(hasRealData(0)).toBe(true);
      expect(hasRealData('')).toBe(true);
      expect(hasRealData('hello')).toBe(true);
      expect(hasRealData(42)).toBe(true);
      expect(hasRealData(true)).toBe(true);
      expect(hasRealData(false)).toBe(true);
    });
  });
});
