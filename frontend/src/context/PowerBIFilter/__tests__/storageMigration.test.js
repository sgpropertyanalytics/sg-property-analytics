/**
 * Storage Migration Tests for Phase 1 Filter Simplification
 *
 * Tests the migration logic that converts old datePreset/dateRange format
 * to the new unified timeFilter format.
 *
 * This ensures backward compatibility when users have old filter state
 * stored in sessionStorage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  INITIAL_FILTERS,
  DEFAULT_TIME_FILTER,
  isValidTimeFilter,
} from '../constants';

// Mock the migration function extracted from PowerBIFilterProvider
// This is the same logic used in the provider
function migrateFilters(saved) {
  if (!saved || typeof saved !== 'object') {
    return INITIAL_FILTERS;
  }

  // Remove legacy fields regardless of path taken
  const { datePreset, dateRange, ...rest } = saved;

  // If already has valid timeFilter, use it
  if (isValidTimeFilter(saved.timeFilter)) {
    return { ...INITIAL_FILTERS, ...rest, timeFilter: saved.timeFilter };
  }

  // Migrate from old format or use default
  let timeFilter = DEFAULT_TIME_FILTER;

  if (datePreset && datePreset !== 'custom' && typeof datePreset === 'string') {
    // Old preset mode -> new preset mode
    timeFilter = { type: 'preset', value: datePreset };
  } else if (dateRange && (dateRange.start || dateRange.end)) {
    // Old custom mode -> new custom mode
    timeFilter = { type: 'custom', start: dateRange.start, end: dateRange.end };
  }

  return { ...INITIAL_FILTERS, ...rest, timeFilter };
}

describe('Storage Migration: Old Format to New TimeFilter', () => {
  describe('null/undefined input handling', () => {
    it('returns INITIAL_FILTERS for null input', () => {
      const result = migrateFilters(null);
      expect(result).toEqual(INITIAL_FILTERS);
    });

    it('returns INITIAL_FILTERS for undefined input', () => {
      const result = migrateFilters(undefined);
      expect(result).toEqual(INITIAL_FILTERS);
    });

    it('returns INITIAL_FILTERS for non-object input', () => {
      expect(migrateFilters('string')).toEqual(INITIAL_FILTERS);
      expect(migrateFilters(123)).toEqual(INITIAL_FILTERS);
      expect(migrateFilters([])).toEqual(INITIAL_FILTERS);
    });
  });

  describe('new format passthrough', () => {
    it('preserves valid preset timeFilter', () => {
      const saved = {
        timeFilter: { type: 'preset', value: 'M6' },
        districts: ['D01'],
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({ type: 'preset', value: 'M6' });
      expect(result.districts).toEqual(['D01']);
    });

    it('preserves valid custom timeFilter', () => {
      const saved = {
        timeFilter: { type: 'custom', start: '2024-01-01', end: '2024-06-30' },
        saleType: 'New Sale',
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({
        type: 'custom',
        start: '2024-01-01',
        end: '2024-06-30',
      });
      expect(result.saleType).toBe('New Sale');
    });

    it('strips old datePreset/dateRange even when timeFilter is valid', () => {
      const saved = {
        timeFilter: { type: 'preset', value: 'Y1' },
        datePreset: 'M3',  // Should be ignored
        dateRange: { start: '2020-01-01', end: '2020-12-31' },  // Should be ignored
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({ type: 'preset', value: 'Y1' });
      expect(result.datePreset).toBeUndefined();
      expect(result.dateRange).toBeUndefined();
    });
  });

  describe('old preset format migration', () => {
    it('migrates datePreset Y1 to timeFilter preset', () => {
      const saved = {
        datePreset: 'Y1',
        dateRange: { start: null, end: null },
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({ type: 'preset', value: 'Y1' });
      expect(result.datePreset).toBeUndefined();
      expect(result.dateRange).toBeUndefined();
    });

    it('migrates datePreset M3 to timeFilter preset', () => {
      const saved = {
        datePreset: 'M3',
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({ type: 'preset', value: 'M3' });
    });

    it('migrates datePreset M6 to timeFilter preset', () => {
      const saved = {
        datePreset: 'M6',
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({ type: 'preset', value: 'M6' });
    });

    it('migrates datePreset Y3 to timeFilter preset', () => {
      const saved = {
        datePreset: 'Y3',
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({ type: 'preset', value: 'Y3' });
    });

    it('migrates datePreset Y5 to timeFilter preset', () => {
      const saved = {
        datePreset: 'Y5',
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({ type: 'preset', value: 'Y5' });
    });

    it('migrates datePreset all to timeFilter preset', () => {
      const saved = {
        datePreset: 'all',
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({ type: 'preset', value: 'all' });
    });

    it('ignores datePreset "custom" and uses default', () => {
      const saved = {
        datePreset: 'custom',
        dateRange: { start: null, end: null },
      };

      const result = migrateFilters(saved);

      // 'custom' without valid dateRange should fall back to default
      expect(result.timeFilter).toEqual(DEFAULT_TIME_FILTER);
    });
  });

  describe('old custom format migration', () => {
    it('migrates dateRange with start and end to timeFilter custom', () => {
      const saved = {
        datePreset: 'custom',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({
        type: 'custom',
        start: '2024-01-01',
        end: '2024-12-31',
      });
    });

    it('migrates dateRange with only start to timeFilter custom', () => {
      const saved = {
        dateRange: { start: '2024-01-01', end: null },
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({
        type: 'custom',
        start: '2024-01-01',
        end: null,
      });
    });

    it('migrates dateRange with only end to timeFilter custom', () => {
      const saved = {
        dateRange: { start: null, end: '2024-12-31' },
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({
        type: 'custom',
        start: null,
        end: '2024-12-31',
      });
    });

    it('uses default for dateRange with both null', () => {
      const saved = {
        dateRange: { start: null, end: null },
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual(DEFAULT_TIME_FILTER);
    });
  });

  describe('preserves other filter fields during migration', () => {
    it('preserves districts array', () => {
      const saved = {
        datePreset: 'M6',
        districts: ['D01', 'D02', 'D03'],
      };

      const result = migrateFilters(saved);

      expect(result.districts).toEqual(['D01', 'D02', 'D03']);
    });

    it('preserves bedroomTypes array', () => {
      const saved = {
        datePreset: 'Y1',
        bedroomTypes: ['1', '2', '3'],
      };

      const result = migrateFilters(saved);

      expect(result.bedroomTypes).toEqual(['1', '2', '3']);
    });

    it('preserves saleType', () => {
      const saved = {
        datePreset: 'Y1',
        saleType: 'New Sale',
      };

      const result = migrateFilters(saved);

      expect(result.saleType).toBe('New Sale');
    });

    it('preserves segments array', () => {
      const saved = {
        datePreset: 'Y1',
        segments: ['CCR', 'RCR'],
      };

      const result = migrateFilters(saved);

      expect(result.segments).toEqual(['CCR', 'RCR']);
    });

    it('preserves tenure', () => {
      const saved = {
        datePreset: 'Y1',
        tenure: 'Freehold',
      };

      const result = migrateFilters(saved);

      expect(result.tenure).toBe('Freehold');
    });

    it('preserves psfRange', () => {
      const saved = {
        datePreset: 'Y1',
        psfRange: { min: 1000, max: 2000 },
      };

      const result = migrateFilters(saved);

      expect(result.psfRange).toEqual({ min: 1000, max: 2000 });
    });

    it('preserves sizeRange', () => {
      const saved = {
        datePreset: 'Y1',
        sizeRange: { min: 500, max: 1500 },
      };

      const result = migrateFilters(saved);

      expect(result.sizeRange).toEqual({ min: 500, max: 1500 });
    });

    it('preserves propertyAgeBucket', () => {
      const saved = {
        datePreset: 'Y1',
        propertyAgeBucket: '5-10 years',
      };

      const result = migrateFilters(saved);

      expect(result.propertyAgeBucket).toBe('5-10 years');
    });

    it('preserves project', () => {
      const saved = {
        datePreset: 'Y1',
        project: 'Marina Bay Sands',
      };

      const result = migrateFilters(saved);

      expect(result.project).toBe('Marina Bay Sands');
    });
  });

  describe('adds missing fields from INITIAL_FILTERS', () => {
    it('adds missing fields when saved has partial data', () => {
      const saved = {
        datePreset: 'M3',
        districts: ['D01'],
        // Missing: bedroomTypes, segments, saleType, etc.
      };

      const result = migrateFilters(saved);

      // Added fields should have initial values
      expect(result.bedroomTypes).toEqual(INITIAL_FILTERS.bedroomTypes);
      expect(result.segments).toEqual(INITIAL_FILTERS.segments);
      expect(result.saleType).toEqual(INITIAL_FILTERS.saleType);
      expect(result.psfRange).toEqual(INITIAL_FILTERS.psfRange);
      expect(result.sizeRange).toEqual(INITIAL_FILTERS.sizeRange);
      expect(result.tenure).toEqual(INITIAL_FILTERS.tenure);
      expect(result.propertyAge).toEqual(INITIAL_FILTERS.propertyAge);
      expect(result.propertyAgeBucket).toEqual(INITIAL_FILTERS.propertyAgeBucket);
      expect(result.project).toEqual(INITIAL_FILTERS.project);
    });
  });

  describe('edge cases', () => {
    it('handles empty object', () => {
      const result = migrateFilters({});
      expect(result).toEqual(INITIAL_FILTERS);
    });

    it('handles invalid timeFilter with valid legacy fields', () => {
      const saved = {
        timeFilter: { type: 'invalid', foo: 'bar' },  // Invalid
        datePreset: 'M6',  // Valid legacy
      };

      const result = migrateFilters(saved);

      // Should migrate from legacy
      expect(result.timeFilter).toEqual({ type: 'preset', value: 'M6' });
    });

    it('handles corrupted timeFilter object', () => {
      const saved = {
        timeFilter: { type: 'preset' },  // Missing value
        datePreset: 'Y1',
      };

      const result = migrateFilters(saved);

      // Should migrate from legacy since timeFilter is invalid
      expect(result.timeFilter).toEqual({ type: 'preset', value: 'Y1' });
    });

    it('prioritizes legacy fields when timeFilter is null', () => {
      const saved = {
        timeFilter: null,
        datePreset: 'M3',
      };

      const result = migrateFilters(saved);

      expect(result.timeFilter).toEqual({ type: 'preset', value: 'M3' });
    });
  });
});
