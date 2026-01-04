/**
 * Phase 1 Filter Simplification Tests
 *
 * Tests for the unified timeFilter implementation that replaces
 * the redundant datePreset/dateRange dual representation.
 *
 * Key functionality tested:
 * 1. isValidTimeFilter - validates timeFilter structure
 * 2. getTimeFilter - safe getter with fallback
 * 3. countActiveFilters - counts timeFilter correctly
 * 4. deriveActiveFilters - breadcrumb overrides work with timeFilter
 */

import { describe, it, expect } from 'vitest';

import {
  INITIAL_FILTERS,
  DEFAULT_TIME_FILTER,
  isValidTimeFilter,
  getTimeFilter,
} from '../constants';

import {
  countActiveFilters,
  deriveActiveFilters,
} from '../utils';

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('INITIAL_FILTERS', () => {
  it('has unified timeFilter field instead of datePreset/dateRange', () => {
    expect(INITIAL_FILTERS.timeFilter).toBeDefined();
    expect(INITIAL_FILTERS.timeFilter.type).toBe('preset');
    expect(INITIAL_FILTERS.timeFilter.value).toBe('Y1');

    // Old fields should NOT exist
    expect(INITIAL_FILTERS.datePreset).toBeUndefined();
    expect(INITIAL_FILTERS.dateRange).toBeUndefined();
  });

  it('DEFAULT_TIME_FILTER matches INITIAL_FILTERS.timeFilter', () => {
    expect(DEFAULT_TIME_FILTER).toEqual(INITIAL_FILTERS.timeFilter);
  });
});

describe('isValidTimeFilter', () => {
  it('returns true for valid preset timeFilter', () => {
    expect(isValidTimeFilter({ type: 'preset', value: 'Y1' })).toBe(true);
    expect(isValidTimeFilter({ type: 'preset', value: 'M3' })).toBe(true);
    expect(isValidTimeFilter({ type: 'preset', value: 'all' })).toBe(true);
  });

  it('returns true for valid custom timeFilter', () => {
    expect(isValidTimeFilter({ type: 'custom', start: '2024-01-01', end: '2024-12-31' })).toBe(true);
    expect(isValidTimeFilter({ type: 'custom', start: null, end: null })).toBe(true);
    expect(isValidTimeFilter({ type: 'custom' })).toBe(true);
  });

  it('returns false for invalid timeFilter', () => {
    expect(isValidTimeFilter(null)).toBe(false);
    expect(isValidTimeFilter(undefined)).toBe(false);
    expect(isValidTimeFilter({})).toBe(false);
    expect(isValidTimeFilter({ type: 'unknown' })).toBe(false);
    expect(isValidTimeFilter({ type: 'preset' })).toBe(false); // missing value
    expect(isValidTimeFilter('Y1')).toBe(false); // not an object
  });
});

describe('getTimeFilter', () => {
  it('returns timeFilter when valid', () => {
    const filters = { timeFilter: { type: 'preset', value: 'M6' } };
    expect(getTimeFilter(filters)).toEqual({ type: 'preset', value: 'M6' });
  });

  it('returns DEFAULT_TIME_FILTER when invalid', () => {
    expect(getTimeFilter(null)).toEqual(DEFAULT_TIME_FILTER);
    expect(getTimeFilter(undefined)).toEqual(DEFAULT_TIME_FILTER);
    expect(getTimeFilter({})).toEqual(DEFAULT_TIME_FILTER);
    expect(getTimeFilter({ timeFilter: null })).toEqual(DEFAULT_TIME_FILTER);
    expect(getTimeFilter({ timeFilter: { type: 'invalid' } })).toEqual(DEFAULT_TIME_FILTER);
  });
});

// =============================================================================
// UTILS TESTS
// =============================================================================

describe('countActiveFilters', () => {
  const baseFilters = {
    ...INITIAL_FILTERS,
    districts: [],
    bedroomTypes: [],
    segments: [],
    saleType: null,
    psfRange: { min: null, max: null },
    sizeRange: { min: null, max: null },
    tenure: null,
    propertyAge: { min: null, max: null },
    propertyAgeBucket: null,
    project: null,
  };

  it('returns 0 for default timeFilter (Y1 preset)', () => {
    expect(countActiveFilters(baseFilters)).toBe(0);
  });

  it('counts non-default preset as active filter', () => {
    const filters = {
      ...baseFilters,
      timeFilter: { type: 'preset', value: 'M3' },
    };
    expect(countActiveFilters(filters)).toBe(1);
  });

  it('counts Y1 preset as inactive (default)', () => {
    const filters = {
      ...baseFilters,
      timeFilter: { type: 'preset', value: 'Y1' },
    };
    expect(countActiveFilters(filters)).toBe(0);
  });

  it('counts custom timeFilter with start date as active', () => {
    const filters = {
      ...baseFilters,
      timeFilter: { type: 'custom', start: '2024-01-01', end: null },
    };
    expect(countActiveFilters(filters)).toBe(1);
  });

  it('counts custom timeFilter with end date as active', () => {
    const filters = {
      ...baseFilters,
      timeFilter: { type: 'custom', start: null, end: '2024-12-31' },
    };
    expect(countActiveFilters(filters)).toBe(1);
  });

  it('counts custom timeFilter with both dates as active', () => {
    const filters = {
      ...baseFilters,
      timeFilter: { type: 'custom', start: '2024-01-01', end: '2024-12-31' },
    };
    expect(countActiveFilters(filters)).toBe(1);
  });

  it('does not count empty custom timeFilter as active', () => {
    const filters = {
      ...baseFilters,
      timeFilter: { type: 'custom', start: null, end: null },
    };
    expect(countActiveFilters(filters)).toBe(0);
  });

  it('handles null filters gracefully', () => {
    expect(countActiveFilters(null)).toBe(0);
    expect(countActiveFilters(undefined)).toBe(0);
  });

  it('handles missing timeFilter gracefully', () => {
    const filters = { ...baseFilters };
    delete filters.timeFilter;
    expect(countActiveFilters(filters)).toBe(0);
  });
});

describe('deriveActiveFilters', () => {
  const emptyBreadcrumbs = { time: [], location: [] };
  const defaultDrillPath = { time: 'month', location: 'region' };

  it('preserves timeFilter from filters when no breadcrumbs', () => {
    const filters = {
      ...INITIAL_FILTERS,
      timeFilter: { type: 'preset', value: 'M6' },
    };

    const active = deriveActiveFilters(filters, emptyBreadcrumbs, defaultDrillPath);

    expect(active.timeFilter).toEqual({ type: 'preset', value: 'M6' });
  });

  it('preserves custom timeFilter when no breadcrumbs', () => {
    const filters = {
      ...INITIAL_FILTERS,
      timeFilter: { type: 'custom', start: '2024-01-01', end: '2024-06-30' },
    };

    const active = deriveActiveFilters(filters, emptyBreadcrumbs, defaultDrillPath);

    expect(active.timeFilter).toEqual({ type: 'custom', start: '2024-01-01', end: '2024-06-30' });
  });

  it('overrides timeFilter with breadcrumb date range when drilling down', () => {
    const filters = {
      ...INITIAL_FILTERS,
      timeFilter: { type: 'preset', value: 'Y1' },
    };

    const breadcrumbs = {
      time: [{ value: '2024', label: '2024' }],
      location: [],
    };
    const drillPath = { time: 'quarter', location: 'region' };

    const active = deriveActiveFilters(filters, breadcrumbs, drillPath);

    // Breadcrumb should override timeFilter to custom date range for 2024
    expect(active.timeFilter.type).toBe('custom');
    expect(active.timeFilter.start).toBe('2024-01-01');
    expect(active.timeFilter.end).toBe('2024-12-31');
  });
});
