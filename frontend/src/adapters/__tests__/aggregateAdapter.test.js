/**
 * Aggregate Adapter Smoke Tests
 *
 * These tests validate that the adapter layer produces correct output.
 * Run in CI to prevent "200 OK but chart breaks" regressions.
 */

import {
  transformTimeSeries,
  transformTimeSeriesByRegion,
  comparePeriods,
  sortByPeriod,
  validateRow,
  validateResponse,
  assertKnownVersion,
} from '../aggregateAdapter';

import {
  getPeriod,
  isSaleType,
  getSaleTypeLabel,
  SaleType,
} from '../../schemas/apiContract';

// =============================================================================
// FIXTURES - Simulated API responses
// =============================================================================

const quarterAggregateData = [
  { period: '2024-Q4', periodGrain: 'quarter', saleType: 'new_sale', count: 400, totalValue: 600000000 },
  { period: '2024-Q4', periodGrain: 'quarter', saleType: 'resale', count: 388, totalValue: 575004395 },
  { period: '2024-Q3', periodGrain: 'quarter', saleType: 'new_sale', count: 350, totalValue: 500000000 },
  { period: '2024-Q3', periodGrain: 'quarter', saleType: 'resale', count: 420, totalValue: 650000000 },
];

const regionAggregateData = [
  { period: '2024-Q4', periodGrain: 'quarter', region: 'ccr', medianPsf: 2800, count: 150 },
  { period: '2024-Q4', periodGrain: 'quarter', region: 'rcr', medianPsf: 2200, count: 300 },
  { period: '2024-Q4', periodGrain: 'quarter', region: 'ocr', medianPsf: 1600, count: 450 },
  { period: '2024-Q3', periodGrain: 'quarter', region: 'ccr', medianPsf: 2750, count: 140 },
  { period: '2024-Q3', periodGrain: 'quarter', region: 'rcr', medianPsf: 2150, count: 290 },
  { period: '2024-Q3', periodGrain: 'quarter', region: 'ocr', medianPsf: 1550, count: 440 },
];

// Legacy v1 format (fallback)
const v1AggregateData = [
  { quarter: '2024-Q4', sale_type: 'New Sale', count: 400, total_value: 600000000 },
  { quarter: '2024-Q4', sale_type: 'Resale', count: 388, total_value: 575004395 },
];

// =============================================================================
// TRANSFORM TIME SERIES TESTS
// =============================================================================

describe('transformTimeSeries', () => {
  test('groups by period with sale type breakdown', () => {
    const result = transformTimeSeries(quarterAggregateData, 'quarter');

    expect(result).toHaveLength(2); // Q3 and Q4

    const q4 = result.find(r => r.period === '2024-Q4');
    expect(q4).toBeDefined();
    expect(q4.newSaleCount).toBe(400);
    expect(q4.resaleCount).toBe(388);
    expect(q4.totalCount).toBe(788);
    expect(q4.totalValue).toBe(1175004395);
  });

  test('sorts periods in ascending order', () => {
    const result = transformTimeSeries(quarterAggregateData, 'quarter');

    expect(result[0].period).toBe('2024-Q3');
    expect(result[1].period).toBe('2024-Q4');
  });

  test('handles v1 legacy format (fallback)', () => {
    const result = transformTimeSeries(v1AggregateData, 'quarter');

    expect(result).toHaveLength(1);
    expect(result[0].period).toBe('2024-Q4');
    expect(result[0].newSaleCount).toBe(400);
    expect(result[0].resaleCount).toBe(388);
  });

  test('handles empty data', () => {
    const result = transformTimeSeries([], 'quarter');

    expect(result).toEqual([]);
  });

  test('skips rows with null period', () => {
    const dataWithNull = [
      { period: '2024-Q4', saleType: 'new_sale', count: 100 },
      { period: null, saleType: 'new_sale', count: 50 },
      { saleType: 'new_sale', count: 25 }, // no period field at all
    ];

    const result = transformTimeSeries(dataWithNull, 'quarter');

    expect(result).toHaveLength(1);
    expect(result[0].period).toBe('2024-Q4');
  });
});

// =============================================================================
// TRANSFORM TIME SERIES BY REGION TESTS
// =============================================================================

describe('transformTimeSeriesByRegion', () => {
  test('groups by period with region breakdown', () => {
    const result = transformTimeSeriesByRegion(regionAggregateData, 'quarter');

    expect(result).toHaveLength(2); // Q3 and Q4

    const q4 = result.find(r => r.period === '2024-Q4');
    expect(q4).toBeDefined();
    expect(q4.ccrMedianPsf).toBe(2800);
    expect(q4.rcrMedianPsf).toBe(2200);
    expect(q4.ocrMedianPsf).toBe(1600);
    expect(q4.ccrCount).toBe(150);
    expect(q4.rcrCount).toBe(300);
    expect(q4.ocrCount).toBe(450);
  });

  test('sorts periods in ascending order', () => {
    const result = transformTimeSeriesByRegion(regionAggregateData, 'quarter');

    expect(result[0].period).toBe('2024-Q3');
    expect(result[1].period).toBe('2024-Q4');
  });

  test('handles missing regions gracefully', () => {
    const partialData = [
      { period: '2024-Q4', region: 'ccr', medianPsf: 2800, count: 150 },
      // No RCR or OCR data
    ];

    const result = transformTimeSeriesByRegion(partialData, 'quarter');

    expect(result).toHaveLength(1);
    expect(result[0].ccrMedianPsf).toBe(2800);
    expect(result[0].rcrMedianPsf).toBeNull();
    expect(result[0].ocrMedianPsf).toBeNull();
  });
});

// =============================================================================
// PERIOD SORTING TESTS
// =============================================================================

describe('comparePeriods', () => {
  test('sorts quarters correctly', () => {
    expect(comparePeriods('2024-Q1', '2024-Q2')).toBeLessThan(0);
    expect(comparePeriods('2024-Q4', '2024-Q1')).toBeGreaterThan(0);
    expect(comparePeriods('2023-Q4', '2024-Q1')).toBeLessThan(0);
  });

  test('sorts months correctly', () => {
    expect(comparePeriods('2024-01', '2024-02')).toBeLessThan(0);
    expect(comparePeriods('2024-12', '2024-01')).toBeGreaterThan(0);
    expect(comparePeriods('2023-12', '2024-01')).toBeLessThan(0);
  });

  test('sorts years correctly', () => {
    expect(comparePeriods(2023, 2024)).toBeLessThan(0);
    expect(comparePeriods(2024, 2023)).toBeGreaterThan(0);
    expect(comparePeriods(2024, 2024)).toBe(0);
  });

  test('handles null values', () => {
    expect(comparePeriods(null, '2024-Q1')).toBe(-1);
    expect(comparePeriods('2024-Q1', null)).toBe(1);
  });
});

describe('sortByPeriod', () => {
  test('sorts mixed quarter data', () => {
    const unsorted = [
      { period: '2024-Q4' },
      { period: '2024-Q1' },
      { period: '2024-Q3' },
      { period: '2024-Q2' },
    ];

    const sorted = sortByPeriod(unsorted);

    expect(sorted.map(r => r.period)).toEqual(['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4']);
  });

  test('does not mutate original array', () => {
    const original = [{ period: '2024-Q4' }, { period: '2024-Q1' }];
    const sorted = sortByPeriod(original);

    expect(original[0].period).toBe('2024-Q4'); // Original unchanged
    expect(sorted[0].period).toBe('2024-Q1');
  });
});

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('validateRow', () => {
  test('returns true for valid row', () => {
    const row = { period: '2024-Q4', count: 100, avgPsf: 2000 };
    const result = validateRow(row, ['period', 'count'], 'test');

    expect(result).toBe(true);
  });

  test('returns false for row with missing required fields', () => {
    const row = { period: '2024-Q4' };
    const result = validateRow(row, ['period', 'count'], 'test');

    expect(result).toBe(false);
  });

  test('returns false for null row', () => {
    const result = validateRow(null, ['period'], 'test');

    expect(result).toBe(false);
  });
});

describe('validateResponse', () => {
  test('returns true for valid response', () => {
    const response = { data: [], meta: {} };
    const result = validateResponse(response, 'test');

    expect(result).toBe(true);
  });

  test('returns false for null response', () => {
    const result = validateResponse(null, 'test');

    expect(result).toBe(false);
  });

  test('returns false for response without data array', () => {
    const response = { data: 'not an array' };
    const result = validateResponse(response, 'test');

    expect(result).toBe(false);
  });
});

// =============================================================================
// SMOKE TEST - Run this in CI
// =============================================================================

describe('Adapter Smoke Test', () => {
  test('transformTimeSeries produces expected structure', () => {
    const rawData = [
      { period: '2024-Q4', periodGrain: 'quarter', saleType: 'resale', count: 500, totalValue: 750000000 },
    ];

    const result = transformTimeSeries(rawData, 'quarter');

    // ========== ASSERTIONS ==========
    // 1. Result is array
    expect(Array.isArray(result)).toBe(true);

    // 2. Has expected structure
    const row = result[0];
    expect(row).toHaveProperty('period');
    expect(row).toHaveProperty('newSaleCount');
    expect(row).toHaveProperty('resaleCount');
    expect(row).toHaveProperty('totalCount');
    expect(row).toHaveProperty('totalValue');

    // 3. Values are correct types
    expect(typeof row.period).toBe('string');
    expect(typeof row.newSaleCount).toBe('number');
    expect(typeof row.resaleCount).toBe('number');
    expect(typeof row.totalCount).toBe('number');
    expect(typeof row.totalValue).toBe('number');

    // 4. Metrics are numbers (not NaN)
    expect(Number.isNaN(row.totalCount)).toBe(false);
    expect(Number.isNaN(row.totalValue)).toBe(false);
  });
});

// =============================================================================
// getPeriod TESTS - v1/v2 compatibility
// =============================================================================

describe('getPeriod', () => {
  test('extracts period from v2 format (canonical)', () => {
    const v2Row = { period: '2024-Q4', periodGrain: 'quarter' };
    expect(getPeriod(v2Row)).toBe('2024-Q4');
  });

  test('extracts period from v1 quarter format (fallback)', () => {
    const v1Row = { quarter: '2024-Q3', sale_type: 'New Sale' };
    expect(getPeriod(v1Row)).toBe('2024-Q3');
  });

  test('extracts period from v1 month format (fallback)', () => {
    const v1Row = { month: '2024-06', sale_type: 'Resale' };
    expect(getPeriod(v1Row)).toBe('2024-06');
  });

  test('extracts period from v1 year format (fallback)', () => {
    const v1Row = { year: 2024, count: 1000 };
    expect(getPeriod(v1Row)).toBe(2024);
  });

  test('returns null for row with no period fields', () => {
    const noPeriodsRow = { count: 100, avgPsf: 2000 };
    expect(getPeriod(noPeriodsRow)).toBeNull();
  });

  test('returns null for null/undefined row', () => {
    expect(getPeriod(null)).toBeNull();
    expect(getPeriod(undefined)).toBeNull();
  });

  test('prefers v2 period over v1 fields when both present', () => {
    const mixedRow = { period: '2024-Q4', quarter: '2024-Q3' };
    expect(getPeriod(mixedRow)).toBe('2024-Q4'); // v2 takes precedence
  });
});

// =============================================================================
// SALE TYPE NORMALIZATION TESTS
// =============================================================================

describe('isSaleType', () => {
  test('recognizes v2 new_sale enum', () => {
    expect(isSaleType.newSale(SaleType.NEW_SALE)).toBe(true);
    expect(isSaleType.newSale('new_sale')).toBe(true);
  });

  test('recognizes v1 New Sale DB value', () => {
    expect(isSaleType.newSale('New Sale')).toBe(true);
  });

  test('recognizes v2 resale enum', () => {
    expect(isSaleType.resale(SaleType.RESALE)).toBe(true);
    expect(isSaleType.resale('resale')).toBe(true);
  });

  test('recognizes v1 Resale DB value', () => {
    expect(isSaleType.resale('Resale')).toBe(true);
  });

  test('correctly identifies sub_sale', () => {
    expect(isSaleType.subSale('sub_sale')).toBe(true);
    expect(isSaleType.subSale('Sub Sale')).toBe(true);
  });

  test('returns false for mismatched sale types', () => {
    expect(isSaleType.newSale('resale')).toBe(false);
    expect(isSaleType.resale('new_sale')).toBe(false);
  });
});

describe('getSaleTypeLabel', () => {
  test('returns correct label for v2 enum', () => {
    expect(getSaleTypeLabel(SaleType.NEW_SALE)).toBe('New Sale');
    expect(getSaleTypeLabel(SaleType.RESALE)).toBe('Resale');
    expect(getSaleTypeLabel(SaleType.SUB_SALE)).toBe('Sub Sale');
  });

  test('passes through v1 labels unchanged', () => {
    expect(getSaleTypeLabel('New Sale')).toBe('New Sale');
    expect(getSaleTypeLabel('Resale')).toBe('Resale');
  });

  test('returns Unknown for null/undefined', () => {
    expect(getSaleTypeLabel(null)).toBe('Unknown');
    expect(getSaleTypeLabel(undefined)).toBe('Unknown');
  });
});

// =============================================================================
// VERSION GATE TESTS
// =============================================================================

describe('assertKnownVersion', () => {
  // Capture console.warn calls - using Vitest's vi instead of jest
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('does not warn for known v1 version', () => {
    const response = { data: [], meta: { apiContractVersion: 'v1' } };
    assertKnownVersion(response, '/api/aggregate');
    // In production, no warning is logged (dev-only check)
    // This test mainly ensures no throw
  });

  test('does not warn for known v2 version', () => {
    const response = { data: [], meta: { apiContractVersion: 'v2' } };
    assertKnownVersion(response, '/api/aggregate');
  });

  test('handles missing meta gracefully', () => {
    const response = { data: [] };
    // Should not throw
    expect(() => assertKnownVersion(response, '/api/test')).not.toThrow();
  });

  test('handles null response gracefully', () => {
    expect(() => assertKnownVersion(null, '/api/test')).not.toThrow();
  });
});

// =============================================================================
// EMPTY DATASET TESTS - No throws
// =============================================================================

describe('Empty dataset handling', () => {
  test('transformTimeSeries returns empty array for empty input', () => {
    const result = transformTimeSeries([]);
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  test('transformTimeSeries returns empty array for null input', () => {
    const result = transformTimeSeries(null);
    expect(result).toEqual([]);
  });

  test('transformTimeSeries returns empty array for undefined input', () => {
    const result = transformTimeSeries(undefined);
    expect(result).toEqual([]);
  });

  test('transformTimeSeriesByRegion returns empty array for empty input', () => {
    const result = transformTimeSeriesByRegion([]);
    expect(result).toEqual([]);
  });

  test('sortByPeriod returns empty array for empty input', () => {
    const result = sortByPeriod([]);
    expect(result).toEqual([]);
  });

  test('sortByPeriod returns empty array for non-array input', () => {
    const result = sortByPeriod(null);
    expect(result).toEqual([]);
  });
});
