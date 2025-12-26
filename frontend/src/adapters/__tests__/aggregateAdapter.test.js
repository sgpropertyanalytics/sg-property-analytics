/**
 * Aggregate Adapter Smoke Tests
 *
 * These tests validate that the adapter layer produces correct output.
 * Run in CI to prevent "200 OK but chart breaks" regressions.
 */

import {
  transformTimeSeries,
  transformTimeSeriesByRegion,
  transformDistributionSeries,
  transformNewVsResaleSeries,
  transformGrowthDumbbellSeries,
  transformTransactionsList,
  comparePeriods,
  sortByPeriod,
  validateRow,
  validateResponse,
  assertKnownVersion,
  formatPrice,
  findBinIndex,
} from '../aggregateAdapter';

import {
  getPeriod,
  isSaleType,
  getSaleTypeLabel,
  SaleType,
  API_CONTRACT_VERSIONS,
  SUPPORTED_API_CONTRACT_VERSIONS,
  CURRENT_API_CONTRACT_VERSION,
  assertKnownVersion as assertKnownVersionFromContract,
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
  test('returns true for valid response with version', () => {
    // Valid response must include apiContractVersion (required in test mode)
    const response = { data: [], meta: { apiContractVersion: 'v3' } };
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

  test('throws for missing meta in test mode', () => {
    const response = { data: [] };
    // In test mode, missing meta throws to catch contract issues early
    expect(() => assertKnownVersion(response, '/api/test')).toThrow(/Missing apiContractVersion/);
  });

  test('throws for null response in test mode', () => {
    // In test mode, null response throws to catch contract issues early
    expect(() => assertKnownVersion(null, '/api/test')).toThrow(/Missing apiContractVersion/);
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

// =============================================================================
// DISTRIBUTION / HISTOGRAM ADAPTER TESTS
// =============================================================================

describe('formatPrice', () => {
  test('formats millions correctly', () => {
    // 2 decimals for millions (user requested for price precision)
    expect(formatPrice(1000000)).toBe('$1.00M');
    expect(formatPrice(1500000)).toBe('$1.50M');
    expect(formatPrice(2345678)).toBe('$2.35M');
  });

  test('formats thousands correctly', () => {
    expect(formatPrice(500000)).toBe('$500K');
    expect(formatPrice(800000)).toBe('$800K');
    expect(formatPrice(999999)).toBe('$1000K');
  });

  test('handles null/undefined', () => {
    expect(formatPrice(null)).toBe('-');
    expect(formatPrice(undefined)).toBe('-');
  });

  test('handles zero', () => {
    expect(formatPrice(0)).toBe('$0K');
  });
});

describe('transformDistributionSeries', () => {
  test('handles null input', () => {
    const result = transformDistributionSeries(null);
    expect(result).toEqual({ bins: [], stats: {}, tail: {}, totalCount: 0 });
  });

  test('handles undefined input', () => {
    const result = transformDistributionSeries(undefined);
    expect(result).toEqual({ bins: [], stats: {}, tail: {}, totalCount: 0 });
  });

  test('handles empty object', () => {
    const result = transformDistributionSeries({});
    expect(result).toEqual({ bins: [], stats: {}, tail: {}, totalCount: 0 });
  });

  test('transforms legacy array format', () => {
    const legacyData = [
      { bin_start: 500000, bin_end: 600000, count: 10 },
      { bin_start: 600000, bin_end: 700000, count: 20 },
    ];

    const result = transformDistributionSeries(legacyData);

    expect(result.bins).toHaveLength(2);
    expect(result.bins[0].start).toBe(500000);
    expect(result.bins[0].end).toBe(600000);
    expect(result.bins[0].count).toBe(10);
    expect(result.stats).toEqual({});
    expect(result.totalCount).toBe(30);
  });

  test('transforms new object format with stats and tail', () => {
    const newData = {
      bins: [
        { bin_start: 1000000, bin_end: 1200000, count: 50 },
        { bin_start: 1200000, bin_end: 1400000, count: 75 },
      ],
      stats: { median: 1150000, p25: 1050000, p75: 1300000 },
      tail: { pct: 5, count: 10 },
    };

    const result = transformDistributionSeries(newData);

    expect(result.bins).toHaveLength(2);
    expect(result.stats.median).toBe(1150000);
    expect(result.tail.pct).toBe(5);
    expect(result.totalCount).toBe(125);
  });

  test('coerces string counts to numbers', () => {
    const dataWithStrings = [
      { bin_start: '500000', bin_end: '600000', count: '10' },
    ];

    const result = transformDistributionSeries(dataWithStrings);

    expect(result.bins[0].start).toBe(500000);
    expect(result.bins[0].end).toBe(600000);
    expect(result.bins[0].count).toBe(10);
    expect(typeof result.bins[0].count).toBe('number');
  });

  test('constructs bin labels correctly', () => {
    const data = [
      { bin_start: 500000, bin_end: 600000, count: 10 },
      { bin_start: 1500000, bin_end: 2000000, count: 5 },
    ];

    const result = transformDistributionSeries(data);

    expect(result.bins[0].label).toBe('$500K-$600K');
    // 2 decimals for millions (user requested for price precision)
    expect(result.bins[1].label).toBe('$1.50M-$2.00M');
  });

  test('handles missing count gracefully', () => {
    const data = [
      { bin_start: 500000, bin_end: 600000 }, // no count
    ];

    const result = transformDistributionSeries(data);

    expect(result.bins[0].count).toBe(0);
    expect(result.totalCount).toBe(0);
  });
});

describe('findBinIndex', () => {
  const sampleBins = [
    { start: 500000, end: 600000 },
    { start: 600000, end: 700000 },
    { start: 700000, end: 800000 },
  ];

  test('finds correct bin index for value in middle of bin', () => {
    expect(findBinIndex(sampleBins, 550000)).toBe(0);
    expect(findBinIndex(sampleBins, 650000)).toBe(1);
    expect(findBinIndex(sampleBins, 750000)).toBe(2);
  });

  test('uses [start, end) for non-last bins, [start, end] for last bin', () => {
    // 600000 is start of bin 1, not end of bin 0 (exclusive end)
    expect(findBinIndex(sampleBins, 600000)).toBe(1);
    // 700000 is start of bin 2, not end of bin 1
    expect(findBinIndex(sampleBins, 700000)).toBe(2);
    // 800000 is end of last bin (inclusive)
    expect(findBinIndex(sampleBins, 800000)).toBe(2);
  });

  test('returns last index for value beyond max', () => {
    expect(findBinIndex(sampleBins, 900000)).toBe(2);
  });

  test('returns first index for value below min', () => {
    expect(findBinIndex(sampleBins, 400000)).toBe(0);
  });

  test('returns -1 for null/undefined price', () => {
    expect(findBinIndex(sampleBins, null)).toBe(-1);
    expect(findBinIndex(sampleBins, undefined)).toBe(-1);
  });

  test('returns -1 for empty bins array', () => {
    expect(findBinIndex([], 500000)).toBe(-1);
  });

  test('returns -1 for null bins array', () => {
    expect(findBinIndex(null, 500000)).toBe(-1);
  });
});

// =============================================================================
// NEW VS RESALE ADAPTER TESTS
// =============================================================================

describe('transformNewVsResaleSeries', () => {
  test('handles null input', () => {
    const result = transformNewVsResaleSeries(null);
    expect(result).toEqual({ chartData: [], summary: {}, hasData: false });
  });

  test('handles undefined input', () => {
    const result = transformNewVsResaleSeries(undefined);
    expect(result).toEqual({ chartData: [], summary: {}, hasData: false });
  });

  test('handles empty object', () => {
    const result = transformNewVsResaleSeries({});
    expect(result.chartData).toEqual([]);
    expect(result.summary.currentPremium).toBeNull();
    expect(result.summary.avgPremium10Y).toBeNull();
    expect(result.summary.premiumTrend).toBeNull();
    expect(result.hasData).toBe(false);
  });

  test('transforms chartData correctly', () => {
    const rawData = {
      chartData: [
        { period: '2024-Q1', newLaunchPrice: 1500000, resalePrice: 1200000, newLaunchCount: 50, resaleCount: 30, premiumPct: 25 },
        { period: '2024-Q2', newLaunchPrice: 1550000, resalePrice: 1250000, newLaunchCount: 45, resaleCount: 35, premiumPct: 24 },
      ],
      summary: { currentPremium: 24, avgPremium10Y: 22, premiumTrend: 'widening' },
    };

    const result = transformNewVsResaleSeries(rawData);

    expect(result.chartData).toHaveLength(2);
    expect(result.chartData[0].period).toBe('2024-Q1');
    expect(result.chartData[0].newLaunchPrice).toBe(1500000);
    expect(result.chartData[0].resalePrice).toBe(1200000);
    expect(result.chartData[0].newLaunchCount).toBe(50);
    expect(result.chartData[0].resaleCount).toBe(30);
    expect(result.chartData[0].premiumPct).toBe(25);
    expect(result.hasData).toBe(true);
  });

  test('normalizes summary with defaults', () => {
    const rawData = {
      chartData: [{ period: '2024-Q1' }],
      summary: { currentPremium: 15 }, // partial summary
    };

    const result = transformNewVsResaleSeries(rawData);

    expect(result.summary.currentPremium).toBe(15);
    expect(result.summary.avgPremium10Y).toBeNull();
    expect(result.summary.premiumTrend).toBeNull();
  });

  test('coerces string counts to numbers', () => {
    const rawData = {
      chartData: [
        { period: '2024-Q1', newLaunchCount: '50', resaleCount: '30' },
      ],
    };

    const result = transformNewVsResaleSeries(rawData);

    expect(result.chartData[0].newLaunchCount).toBe(50);
    expect(result.chartData[0].resaleCount).toBe(30);
    expect(typeof result.chartData[0].newLaunchCount).toBe('number');
  });

  test('handles missing optional fields with null', () => {
    const rawData = {
      chartData: [
        { period: '2024-Q1' }, // no prices or counts
      ],
    };

    const result = transformNewVsResaleSeries(rawData);

    expect(result.chartData[0].newLaunchPrice).toBeNull();
    expect(result.chartData[0].resalePrice).toBeNull();
    expect(result.chartData[0].newLaunchCount).toBe(0);
    expect(result.chartData[0].resaleCount).toBe(0);
    expect(result.chartData[0].premiumPct).toBeNull();
  });

  test('hasData is false when chartData is empty', () => {
    const rawData = { chartData: [], summary: {} };
    const result = transformNewVsResaleSeries(rawData);
    expect(result.hasData).toBe(false);
  });

  test('hasData is true when chartData has items', () => {
    const rawData = { chartData: [{ period: '2024-Q1' }], summary: {} };
    const result = transformNewVsResaleSeries(rawData);
    expect(result.hasData).toBe(true);
  });
});

// =============================================================================
// GROWTH DUMBBELL ADAPTER TESTS
// =============================================================================

describe('transformGrowthDumbbellSeries', () => {
  const sampleDistrictData = [
    { district: 'D01', quarter: '2023-Q1', medianPsf: 2000 },
    { district: 'D01', quarter: '2023-Q2', medianPsf: 2100 },
    { district: 'D01', quarter: '2023-Q3', medianPsf: 2200 },
    { district: 'D02', quarter: '2023-Q1', medianPsf: 1800 },
    { district: 'D02', quarter: '2023-Q2', medianPsf: 1850 },
    { district: 'D02', quarter: '2023-Q3', medianPsf: 1900 },
    { district: 'D03', quarter: '2023-Q1', medianPsf: 1500 },
    { district: 'D03', quarter: '2023-Q3', medianPsf: 1650 }, // Q2 missing - still valid
  ];

  const allDistricts = ['D01', 'D02', 'D03', 'D04'];

  test('handles null input', () => {
    const result = transformGrowthDumbbellSeries(null);
    expect(result).toEqual({ chartData: [], startQuarter: '', endQuarter: '' });
  });

  test('handles undefined input', () => {
    const result = transformGrowthDumbbellSeries(undefined);
    expect(result).toEqual({ chartData: [], startQuarter: '', endQuarter: '' });
  });

  test('handles empty array', () => {
    const result = transformGrowthDumbbellSeries([]);
    expect(result).toEqual({ chartData: [], startQuarter: '', endQuarter: '' });
  });

  test('groups data by district and calculates growth', () => {
    const result = transformGrowthDumbbellSeries(sampleDistrictData, { districts: allDistricts });

    expect(result.chartData).toHaveLength(3); // D01, D02, D03 (D04 has no data)

    const d01 = result.chartData.find(d => d.district === 'D01');
    expect(d01).toBeDefined();
    expect(d01.startPsf).toBe(2000);
    expect(d01.endPsf).toBe(2200);
    expect(d01.startQuarter).toBe('2023-Q1');
    expect(d01.endQuarter).toBe('2023-Q3');
    expect(d01.growthPercent).toBe(10); // (2200 - 2000) / 2000 * 100 = 10%
  });

  test('calculates growth percentage correctly', () => {
    const result = transformGrowthDumbbellSeries(sampleDistrictData, { districts: allDistricts });

    const d01 = result.chartData.find(d => d.district === 'D01');
    const d02 = result.chartData.find(d => d.district === 'D02');
    const d03 = result.chartData.find(d => d.district === 'D03');

    // D01: (2200 - 2000) / 2000 * 100 = 10%
    expect(d01.growthPercent).toBeCloseTo(10, 1);

    // D02: (1900 - 1800) / 1800 * 100 = 5.56%
    expect(d02.growthPercent).toBeCloseTo(5.56, 1);

    // D03: (1650 - 1500) / 1500 * 100 = 10%
    expect(d03.growthPercent).toBeCloseTo(10, 1);
  });

  test('tracks global start and end quarters', () => {
    const result = transformGrowthDumbbellSeries(sampleDistrictData, { districts: allDistricts });

    expect(result.startQuarter).toBe('2023-Q1');
    expect(result.endQuarter).toBe('2023-Q3');
  });

  test('skips districts with less than 2 valid data points', () => {
    const dataWithSinglePoint = [
      { district: 'D01', quarter: '2023-Q1', medianPsf: 2000 },
      { district: 'D01', quarter: '2023-Q2', medianPsf: 2100 },
      { district: 'D02', quarter: '2023-Q1', medianPsf: 1800 }, // Only one point
    ];

    const result = transformGrowthDumbbellSeries(dataWithSinglePoint, { districts: ['D01', 'D02'] });

    expect(result.chartData).toHaveLength(1); // Only D01
    expect(result.chartData[0].district).toBe('D01');
  });

  test('skips data points with zero or missing medianPsf', () => {
    const dataWithZeros = [
      { district: 'D01', quarter: '2023-Q1', medianPsf: 0 },
      { district: 'D01', quarter: '2023-Q2', medianPsf: 2100 },
      { district: 'D01', quarter: '2023-Q3', medianPsf: 2200 },
    ];

    const result = transformGrowthDumbbellSeries(dataWithZeros, { districts: ['D01'] });

    // Should use Q2 as start since Q1 has 0 PSF
    expect(result.chartData[0].startPsf).toBe(2100);
    expect(result.chartData[0].endPsf).toBe(2200);
    expect(result.chartData[0].startQuarter).toBe('2023-Q2');
  });

  test('sorts quarters chronologically within each district', () => {
    const unsortedData = [
      { district: 'D01', quarter: '2023-Q3', medianPsf: 2200 },
      { district: 'D01', quarter: '2023-Q1', medianPsf: 2000 },
      { district: 'D01', quarter: '2023-Q2', medianPsf: 2100 },
    ];

    const result = transformGrowthDumbbellSeries(unsortedData, { districts: ['D01'] });

    expect(result.chartData[0].startQuarter).toBe('2023-Q1');
    expect(result.chartData[0].endQuarter).toBe('2023-Q3');
  });

  test('works without district filter (includes all districts)', () => {
    const result = transformGrowthDumbbellSeries(sampleDistrictData);

    // Should include all 3 districts from the data
    expect(result.chartData).toHaveLength(3);
  });

  test('handles negative growth (price decline)', () => {
    const decliningData = [
      { district: 'D01', quarter: '2023-Q1', medianPsf: 2000 },
      { district: 'D01', quarter: '2023-Q2', medianPsf: 1800 },
    ];

    const result = transformGrowthDumbbellSeries(decliningData, { districts: ['D01'] });

    // (1800 - 2000) / 2000 * 100 = -10%
    expect(result.chartData[0].growthPercent).toBeCloseTo(-10, 1);
  });

  test('uses avgPsf as fallback when medianPsf is missing', () => {
    const dataWithAvgPsf = [
      { district: 'D01', quarter: '2023-Q1', avgPsf: 2000 },
      { district: 'D01', quarter: '2023-Q2', avgPsf: 2100 },
    ];

    const result = transformGrowthDumbbellSeries(dataWithAvgPsf, { districts: ['D01'] });

    expect(result.chartData[0].startPsf).toBe(2000);
    expect(result.chartData[0].endPsf).toBe(2100);
  });
});

// =============================================================================
// TRANSACTIONS LIST ADAPTER TESTS
// =============================================================================

describe('transformTransactionsList', () => {
  test('handles null input', () => {
    const result = transformTransactionsList(null);
    expect(result).toEqual({ transactions: [], totalRecords: 0, totalPages: 0 });
  });

  test('handles undefined input', () => {
    const result = transformTransactionsList(undefined);
    expect(result).toEqual({ transactions: [], totalRecords: 0, totalPages: 0 });
  });

  test('handles empty object', () => {
    const result = transformTransactionsList({});
    expect(result).toEqual({ transactions: [], totalRecords: 0, totalPages: 0 });
  });

  test('extracts transactions array', () => {
    const rawData = {
      transactions: [
        { id: 1, project_name: 'Project A' },
        { id: 2, project_name: 'Project B' },
      ],
      pagination: { total_records: 100, total_pages: 10 },
    };

    const result = transformTransactionsList(rawData);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].project_name).toBe('Project A');
  });

  test('extracts pagination info', () => {
    const rawData = {
      transactions: [],
      pagination: { total_records: 250, total_pages: 25 },
    };

    const result = transformTransactionsList(rawData);

    expect(result.totalRecords).toBe(250);
    expect(result.totalPages).toBe(25);
  });

  test('handles missing pagination gracefully', () => {
    const rawData = {
      transactions: [{ id: 1 }],
    };

    const result = transformTransactionsList(rawData);

    expect(result.transactions).toHaveLength(1);
    expect(result.totalRecords).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  test('coerces string pagination values to numbers', () => {
    const rawData = {
      transactions: [],
      pagination: { total_records: '100', total_pages: '10' },
    };

    const result = transformTransactionsList(rawData);

    expect(result.totalRecords).toBe(100);
    expect(result.totalPages).toBe(10);
    expect(typeof result.totalRecords).toBe('number');
    expect(typeof result.totalPages).toBe('number');
  });

  test('handles invalid transactions value', () => {
    const rawData = {
      transactions: 'not an array',
      pagination: { total_records: 5 },
    };

    const result = transformTransactionsList(rawData);

    expect(result.transactions).toEqual([]);
  });
});

// =============================================================================
// API CONTRACT VERSION TESTS
// =============================================================================

describe('API Contract Versioning', () => {
  describe('Version Constants', () => {
    test('v3 is the current version', () => {
      expect(CURRENT_API_CONTRACT_VERSION).toBe('v3');
    });

    test('supported versions include v1, v2, v3', () => {
      expect(SUPPORTED_API_CONTRACT_VERSIONS.has('v1')).toBe(true);
      expect(SUPPORTED_API_CONTRACT_VERSIONS.has('v2')).toBe(true);
      expect(SUPPORTED_API_CONTRACT_VERSIONS.has('v3')).toBe(true);
    });

    test('API_CONTRACT_VERSIONS object has correct values', () => {
      expect(API_CONTRACT_VERSIONS.V1).toBe('v1');
      expect(API_CONTRACT_VERSIONS.V2).toBe('v2');
      expect(API_CONTRACT_VERSIONS.V3).toBe('v3');
    });
  });

  describe('assertKnownVersion (from apiContract)', () => {
    test('returns true for v1', () => {
      expect(assertKnownVersionFromContract({ apiContractVersion: 'v1' })).toBe(true);
    });

    test('returns true for v2', () => {
      expect(assertKnownVersionFromContract({ apiContractVersion: 'v2' })).toBe(true);
    });

    test('returns true for v3', () => {
      expect(assertKnownVersionFromContract({ apiContractVersion: 'v3' })).toBe(true);
    });

    test('throws for explicitly unknown version in test mode', () => {
      // This test verifies explicitly unsupported versions throw in test mode
      // v999 is not in SUPPORTED_API_CONTRACT_VERSIONS so it must throw
      expect(() => {
        assertKnownVersionFromContract({ apiContractVersion: 'v999' });
      }).toThrow(/Unknown apiContractVersion: v999/);
    });

    test('throws for missing version in test mode', () => {
      // In test mode, missing version throws (undefined is not in supported versions)
      expect(() => {
        assertKnownVersionFromContract({});
      }).toThrow(/Unknown apiContractVersion: undefined/);
    });

    test('throws for null meta in test mode', () => {
      // In test mode, null meta throws (undefined version is not supported)
      expect(() => {
        assertKnownVersionFromContract(null);
      }).toThrow(/Unknown apiContractVersion: undefined/);
    });

    test('unknown version throws in test mode', () => {
      // In test mode (NODE_ENV=test), unknown version SHOULD throw
      // This ensures CI catches contract drift before production
      expect(() => {
        assertKnownVersionFromContract({ apiContractVersion: 'v999' });
      }).toThrow(/Unknown apiContractVersion: v999/);
    });
  });

  describe('Adapter assertKnownVersion', () => {
    test('does not throw for v1 response', () => {
      expect(() => {
        assertKnownVersion({ meta: { apiContractVersion: 'v1' }, data: [] }, '/api/test');
      }).not.toThrow();
    });

    test('does not throw for v2 response', () => {
      expect(() => {
        assertKnownVersion({ meta: { apiContractVersion: 'v2' }, data: [] }, '/api/test');
      }).not.toThrow();
    });

    test('does not throw for v3 response', () => {
      expect(() => {
        assertKnownVersion({ meta: { apiContractVersion: 'v3' }, data: [] }, '/api/test');
      }).not.toThrow();
    });

    test('throws for unknown version in test mode', () => {
      // In test mode (NODE_ENV=test), unknown version SHOULD throw
      // This ensures CI catches contract drift before production
      expect(() => {
        assertKnownVersion({ meta: { apiContractVersion: 'v999' }, data: [] }, '/api/test');
      }).toThrow(/Unknown version "v999"/);
    });

    test('throws for missing version in test mode', () => {
      // Missing version should also throw in test mode
      expect(() => {
        assertKnownVersion({ meta: {}, data: [] }, '/api/test');
      }).toThrow(/Missing apiContractVersion/);
    });
  });
});

// =============================================================================
// GOLDEN TESTS - Output Shape Contracts
// =============================================================================
// These tests freeze the adapter output shapes as the "real contract".
// If these fail, it means a chart may break - review carefully before updating.

describe('Golden Tests - Adapter Output Shapes', () => {
  describe('transformTimeSeries output shape', () => {
    test('has required contract fields', () => {
      const input = [
        { period: '2024-Q4', periodGrain: 'quarter', saleType: 'new_sale', count: 100, totalValue: 150000000 },
        { period: '2024-Q4', periodGrain: 'quarter', saleType: 'resale', count: 200, totalValue: 350000000 },
      ];

      const result = transformTimeSeries(input, 'quarter');

      // Golden shape - every output row MUST have these required fields
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('period');
      expect(result[0]).toHaveProperty('periodGrain');
      expect(result[0]).toHaveProperty('newSaleCount');
      expect(result[0]).toHaveProperty('resaleCount');
      expect(result[0]).toHaveProperty('totalCount');
      expect(result[0]).toHaveProperty('totalValue');

      // Type checks
      expect(typeof result[0].period).toBe('string');
      expect(typeof result[0].newSaleCount).toBe('number');
      expect(typeof result[0].totalCount).toBe('number');
    });
  });

  describe('transformTimeSeriesByRegion output shape', () => {
    test('has required contract fields', () => {
      const input = [
        { period: '2024-Q4', periodGrain: 'quarter', region: 'ccr', medianPsf: 2800, count: 100 },
        { period: '2024-Q4', periodGrain: 'quarter', region: 'rcr', medianPsf: 2200, count: 200 },
      ];

      const result = transformTimeSeriesByRegion(input, 'quarter');

      // Golden shape - every output row MUST have these fields
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('period');
      expect(result[0]).toHaveProperty('periodGrain');
      expect(result[0]).toHaveProperty('ccrMedianPsf');
      expect(result[0]).toHaveProperty('rcrMedianPsf');
      expect(result[0]).toHaveProperty('ocrMedianPsf');
      expect(result[0]).toHaveProperty('ccrCount');
      expect(result[0]).toHaveProperty('rcrCount');
      expect(result[0]).toHaveProperty('ocrCount');

      // Region values can be number or null
      expect(result[0].ccrMedianPsf === null || typeof result[0].ccrMedianPsf === 'number').toBe(true);
    });
  });

  describe('transformDistributionSeries output shape', () => {
    test('has required contract fields', () => {
      // Use actual histogram format expected by the adapter
      const input = {
        bins: [
          { bin_start: 1000, bin_end: 1500, count: 50 },
          { bin_start: 1500, bin_end: 2000, count: 75 },
        ],
        stats: { mean: 1750 },
        tail: {},
      };

      const result = transformDistributionSeries(input);

      // transformDistributionSeries returns { bins, stats, tail, totalCount }
      expect(result).toHaveProperty('bins');
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.bins)).toBe(true);
      expect(result.bins.length).toBe(2);

      // Each bin has start, end, label, count
      expect(result.bins[0]).toHaveProperty('start');
      expect(result.bins[0]).toHaveProperty('end');
      expect(result.bins[0]).toHaveProperty('label');
      expect(result.bins[0]).toHaveProperty('count');
    });
  });

  describe('transformNewVsResaleSeries output shape', () => {
    test('has required contract fields', () => {
      // This adapter expects pre-processed data with chartData array
      const input = {
        chartData: [
          { period: '2024-Q4', newLaunchPrice: 2500, resalePrice: 2100, newLaunchCount: 100, resaleCount: 200, premiumPct: 19.0 },
        ],
        summary: { avgPremium: 19.0 },
      };

      const result = transformNewVsResaleSeries(input);

      // Golden shape - returns { chartData, summary, hasData }
      expect(result).toHaveProperty('chartData');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('hasData');
      expect(result.chartData).toHaveLength(1);

      // Each chartData row has required fields
      expect(result.chartData[0]).toHaveProperty('period');
      expect(result.chartData[0]).toHaveProperty('newLaunchPrice');
      expect(result.chartData[0]).toHaveProperty('resalePrice');
      expect(result.chartData[0]).toHaveProperty('newLaunchCount');
      expect(result.chartData[0]).toHaveProperty('resaleCount');
    });
  });

  describe('transformGrowthDumbbellSeries output shape', () => {
    test('has required contract fields', () => {
      const input = [
        { district: 'D01', quarter: '2023-Q4', medianPsf: 2500, count: 50 },
        { district: 'D01', quarter: '2024-Q4', medianPsf: 2700, count: 60 },
        { district: 'D02', quarter: '2023-Q4', medianPsf: 2400, count: 40 },
        { district: 'D02', quarter: '2024-Q4', medianPsf: 2500, count: 45 },
      ];

      const result = transformGrowthDumbbellSeries(input, { districts: ['D01', 'D02'] });

      // Golden shape - returns { chartData, startQuarter, endQuarter }
      expect(result).toHaveProperty('chartData');
      expect(result).toHaveProperty('startQuarter');
      expect(result).toHaveProperty('endQuarter');

      // Each chartData row has required fields
      if (result.chartData.length > 0) {
        expect(result.chartData[0]).toHaveProperty('district');
        expect(result.chartData[0]).toHaveProperty('startPsf');
        expect(result.chartData[0]).toHaveProperty('endPsf');
        expect(result.chartData[0]).toHaveProperty('growthPercent');
        expect(result.chartData[0]).toHaveProperty('startQuarter');
        expect(result.chartData[0]).toHaveProperty('endQuarter');
      }
    });
  });

  describe('transformTransactionsList output shape', () => {
    test('has required contract fields', () => {
      // This adapter expects a response with transactions array and pagination
      const input = {
        transactions: [
          {
            id: 1,
            projectName: 'Test Project',
            district: 'D01',
            bedroomCount: 2,
            areaSqft: 800,
            price: 1500000,
            psf: 1875,
            transactionDate: '2024-06-15',
            saleType: 'new_sale',
            tenure: 'freehold',
            floorRange: '10 to 12',
          },
        ],
        pagination: { total_records: 1, total_pages: 1 },
      };

      const result = transformTransactionsList(input);

      // Golden shape - returns { transactions, totalRecords, totalPages }
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('totalRecords');
      expect(result).toHaveProperty('totalPages');
      expect(result.transactions).toHaveLength(1);

      // Each transaction row has required fields
      expect(result.transactions[0]).toHaveProperty('id');
      expect(result.transactions[0]).toHaveProperty('projectName');
      expect(result.transactions[0]).toHaveProperty('district');
      expect(result.transactions[0]).toHaveProperty('price');
      expect(result.transactions[0]).toHaveProperty('psf');
    });
  });

  describe('Empty input handling', () => {
    test('simple array adapters return empty array for empty input', () => {
      expect(transformTimeSeries([], 'quarter')).toEqual([]);
      expect(transformTimeSeriesByRegion([], 'quarter')).toEqual([]);
    });

    test('complex adapters return structured empty result for empty input', () => {
      // transformNewVsResaleSeries returns { chartData, summary, hasData }
      const newVsResale = transformNewVsResaleSeries([]);
      expect(newVsResale.chartData).toEqual([]);
      expect(newVsResale.hasData).toBe(false);

      // transformGrowthDumbbellSeries returns { chartData, startQuarter, endQuarter }
      const growth = transformGrowthDumbbellSeries([]);
      expect(growth.chartData).toEqual([]);

      // transformTransactionsList returns { transactions, totalRecords, totalPages }
      const transactions = transformTransactionsList({ transactions: [] });
      expect(transactions.transactions).toEqual([]);
      expect(transactions.totalRecords).toBe(0);
    });

    test('distribution adapter returns empty bins for empty input', () => {
      const result = transformDistributionSeries([]);
      expect(result.bins).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    test('simple array adapters return empty array for null/undefined input', () => {
      expect(transformTimeSeries(null, 'quarter')).toEqual([]);
      expect(transformTimeSeries(undefined, 'quarter')).toEqual([]);
      expect(transformTimeSeriesByRegion(null, 'quarter')).toEqual([]);
    });

    test('complex adapters return structured empty result for null input', () => {
      // transformNewVsResaleSeries returns { chartData, summary, hasData }
      const newVsResale = transformNewVsResaleSeries(null);
      expect(newVsResale.chartData).toEqual([]);
      expect(newVsResale.hasData).toBe(false);

      // transformGrowthDumbbellSeries returns { chartData, startQuarter, endQuarter }
      const growth = transformGrowthDumbbellSeries(null);
      expect(growth.chartData).toEqual([]);

      // transformTransactionsList returns { transactions, totalRecords, totalPages }
      const transactions = transformTransactionsList(null);
      expect(transactions.transactions).toEqual([]);
      expect(transactions.totalRecords).toBe(0);
    });

    test('distribution adapter returns empty result for null input', () => {
      const result = transformDistributionSeries(null);
      expect(result).toMatchObject({ bins: [], totalCount: 0 });
    });
  });
});
