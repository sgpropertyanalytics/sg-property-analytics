/**
 * PowerBI Filter Utils Tests
 *
 * Comprehensive tests for buildApiParamsFromState() - verifies that filter
 * combinations are correctly mapped to API query parameters.
 *
 * This is critical for ensuring filters actually work end-to-end.
 * The TimeTrendChart tests verify buildApiParams is CALLED; these tests
 * verify buildApiParamsFromState returns CORRECT params for each filter.
 */

import { describe, it, expect } from 'vitest';

import { INITIAL_FILTERS } from '../constants';
import { buildApiParamsFromState } from '../utils';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Base filter state with all filters at default (empty/null).
 * Individual tests override specific filters.
 */
const createBaseFilters = () => ({
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
});

const emptyFactFilter = { priceRange: { min: null, max: null } };

// =============================================================================
// DISTRICT FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - districts', () => {
  it('maps single district to comma-separated param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.districts = ['D01'];

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.district).toBe('D01');
  });

  it('maps multiple districts to comma-separated param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.districts = ['D01', 'D09', 'D15'];

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.district).toBe('D01,D09,D15');
  });

  it('omits district param when empty', () => {
    const activeFilters = createBaseFilters();
    activeFilters.districts = [];

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.district).toBeUndefined();
  });

  it('excludes district when excludeOwnDimension is district', () => {
    const activeFilters = createBaseFilters();
    activeFilters.districts = ['D01', 'D09'];

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      {},
      { excludeOwnDimension: 'district' }
    );

    expect(params.district).toBeUndefined();
  });

  it('uses filters.districts when excludeLocationDrill is true', () => {
    const activeFilters = createBaseFilters();
    activeFilters.districts = ['D01', 'D09']; // from breadcrumb override

    const sidebarFilters = createBaseFilters();
    sidebarFilters.districts = ['D15']; // original sidebar selection

    const params = buildApiParamsFromState(
      activeFilters,
      sidebarFilters,
      emptyFactFilter,
      {},
      { excludeLocationDrill: true }
    );

    expect(params.district).toBe('D15');
  });
});

// =============================================================================
// BEDROOM FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - bedrooms', () => {
  it('maps single bedroom to comma-separated param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.bedroomTypes = ['2'];

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.bedroom).toBe('2');
  });

  it('maps multiple bedrooms to comma-separated param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.bedroomTypes = ['1', '2', '3'];

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.bedroom).toBe('1,2,3');
  });

  it('omits bedroom param when empty', () => {
    const activeFilters = createBaseFilters();
    activeFilters.bedroomTypes = [];

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.bedroom).toBeUndefined();
  });

  it('excludes bedroom when excludeOwnDimension is bedroom', () => {
    const activeFilters = createBaseFilters();
    activeFilters.bedroomTypes = ['1', '2'];

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      {},
      { excludeOwnDimension: 'bedroom' }
    );

    expect(params.bedroom).toBeUndefined();
  });
});

// =============================================================================
// SEGMENT FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - segments', () => {
  it('maps single segment to comma-separated param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.segments = ['CCR'];

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.segment).toBe('CCR');
  });

  it('maps multiple segments to comma-separated param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.segments = ['CCR', 'RCR', 'OCR'];

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.segment).toBe('CCR,RCR,OCR');
  });

  it('omits segment param when empty', () => {
    const activeFilters = createBaseFilters();
    activeFilters.segments = [];

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.segment).toBeUndefined();
  });

  it('excludes segment when excludeOwnDimension is segment', () => {
    const activeFilters = createBaseFilters();
    activeFilters.segments = ['CCR'];

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      {},
      { excludeOwnDimension: 'segment' }
    );

    expect(params.segment).toBeUndefined();
  });

  it('uses filters.segments when excludeLocationDrill is true', () => {
    const activeFilters = createBaseFilters();
    activeFilters.segments = ['CCR']; // from breadcrumb override

    const sidebarFilters = createBaseFilters();
    sidebarFilters.segments = ['RCR', 'OCR']; // original sidebar selection

    const params = buildApiParamsFromState(
      activeFilters,
      sidebarFilters,
      emptyFactFilter,
      {},
      { excludeLocationDrill: true }
    );

    expect(params.segment).toBe('RCR,OCR');
  });
});

// =============================================================================
// SALE TYPE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - saleType', () => {
  it('maps Resale to saleType param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.saleType = 'Resale';

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.saleType).toBe('Resale');
  });

  it('maps New Sale to saleType param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.saleType = 'New Sale';

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.saleType).toBe('New Sale');
  });

  it('omits saleType param when null', () => {
    const activeFilters = createBaseFilters();
    activeFilters.saleType = null;

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.saleType).toBeUndefined();
  });

  it('excludes saleType when excludeOwnDimension is sale_type', () => {
    const activeFilters = createBaseFilters();
    activeFilters.saleType = 'Resale';

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      {},
      { excludeOwnDimension: 'sale_type' }
    );

    expect(params.saleType).toBeUndefined();
  });

  it('additionalParams.saleType takes precedence over filter', () => {
    const activeFilters = createBaseFilters();
    activeFilters.saleType = 'New Sale'; // filter says New Sale

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      { sale_type: 'Resale' } // page-level override
    );

    // Page-level saleType should win (already in additionalParams)
    expect(params.saleType).toBe('Resale');
  });
});

// =============================================================================
// TIME FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - timeFilter', () => {
  it('maps preset Y1 to timeframe param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.timeFilter = { type: 'preset', value: 'Y1' };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.timeframe).toBe('Y1');
    expect(params.dateFrom).toBeUndefined();
    expect(params.dateTo).toBeUndefined();
  });

  it('maps preset M3 to timeframe param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.timeFilter = { type: 'preset', value: 'M3' };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.timeframe).toBe('M3');
  });

  it('maps preset all to timeframe param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.timeFilter = { type: 'preset', value: 'all' };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.timeframe).toBe('all');
  });

  it('maps custom date range to dateFrom/dateTo params', () => {
    const activeFilters = createBaseFilters();
    activeFilters.timeFilter = {
      type: 'custom',
      start: '2024-01-01',
      end: '2024-12-31',
    };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.timeframe).toBeUndefined();
    expect(params.dateFrom).toBe('2024-01-01');
    expect(params.dateTo).toBe('2024-12-31');
  });

  it('handles partial custom range (start only)', () => {
    const activeFilters = createBaseFilters();
    activeFilters.timeFilter = { type: 'custom', start: '2024-01-01', end: null };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.dateFrom).toBe('2024-01-01');
    expect(params.dateTo).toBeUndefined();
  });

  it('handles partial custom range (end only)', () => {
    const activeFilters = createBaseFilters();
    activeFilters.timeFilter = { type: 'custom', start: null, end: '2024-12-31' };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.dateFrom).toBeUndefined();
    expect(params.dateTo).toBe('2024-12-31');
  });

  it('handles empty custom range', () => {
    const activeFilters = createBaseFilters();
    activeFilters.timeFilter = { type: 'custom', start: null, end: null };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.timeframe).toBeUndefined();
    expect(params.dateFrom).toBeUndefined();
    expect(params.dateTo).toBeUndefined();
  });
});

// =============================================================================
// PSF RANGE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - psfRange', () => {
  it('maps psfRange.min to psfMin param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.psfRange = { min: 1000, max: null };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.psfMin).toBe(1000);
    expect(params.psfMax).toBeUndefined();
  });

  it('maps psfRange.max to psfMax param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.psfRange = { min: null, max: 2500 };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.psfMin).toBeUndefined();
    expect(params.psfMax).toBe(2500);
  });

  it('maps both psfRange.min and max', () => {
    const activeFilters = createBaseFilters();
    activeFilters.psfRange = { min: 1000, max: 2500 };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.psfMin).toBe(1000);
    expect(params.psfMax).toBe(2500);
  });

  it('omits psf params when both null', () => {
    const activeFilters = createBaseFilters();
    activeFilters.psfRange = { min: null, max: null };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.psfMin).toBeUndefined();
    expect(params.psfMax).toBeUndefined();
  });
});

// =============================================================================
// SIZE RANGE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - sizeRange', () => {
  it('maps sizeRange.min to sizeMin param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.sizeRange = { min: 500, max: null };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.sizeMin).toBe(500);
    expect(params.sizeMax).toBeUndefined();
  });

  it('maps sizeRange.max to sizeMax param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.sizeRange = { min: null, max: 1500 };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.sizeMin).toBeUndefined();
    expect(params.sizeMax).toBe(1500);
  });

  it('maps both sizeRange.min and max', () => {
    const activeFilters = createBaseFilters();
    activeFilters.sizeRange = { min: 500, max: 1500 };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.sizeMin).toBe(500);
    expect(params.sizeMax).toBe(1500);
  });

  it('omits size params when both null', () => {
    const activeFilters = createBaseFilters();
    activeFilters.sizeRange = { min: null, max: null };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.sizeMin).toBeUndefined();
    expect(params.sizeMax).toBeUndefined();
  });
});

// =============================================================================
// TENURE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - tenure', () => {
  it('maps Freehold tenure to tenure param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.tenure = 'Freehold';

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.tenure).toBe('Freehold');
  });

  it('maps 99-year tenure to tenure param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.tenure = '99-year';

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.tenure).toBe('99-year');
  });

  it('maps 999-year tenure to tenure param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.tenure = '999-year';

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.tenure).toBe('999-year');
  });

  it('omits tenure param when null', () => {
    const activeFilters = createBaseFilters();
    activeFilters.tenure = null;

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.tenure).toBeUndefined();
  });
});

// =============================================================================
// PROPERTY AGE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - propertyAge', () => {
  it('maps propertyAge.min to propertyAgeMin param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.propertyAge = { min: 0, max: null };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.propertyAgeMin).toBe(0);
    expect(params.propertyAgeMax).toBeUndefined();
  });

  it('maps propertyAge.max to propertyAgeMax param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.propertyAge = { min: null, max: 10 };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.propertyAgeMin).toBeUndefined();
    expect(params.propertyAgeMax).toBe(10);
  });

  it('maps both propertyAge.min and max', () => {
    const activeFilters = createBaseFilters();
    activeFilters.propertyAge = { min: 5, max: 15 };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.propertyAgeMin).toBe(5);
    expect(params.propertyAgeMax).toBe(15);
  });

  it('omits propertyAge params when both null', () => {
    const activeFilters = createBaseFilters();
    activeFilters.propertyAge = { min: null, max: null };

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.propertyAgeMin).toBeUndefined();
    expect(params.propertyAgeMax).toBeUndefined();
  });
});

// =============================================================================
// PROPERTY AGE BUCKET FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - propertyAgeBucket', () => {
  it('maps propertyAgeBucket to propertyAgeBucket param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.propertyAgeBucket = 'NEW';

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.propertyAgeBucket).toBe('NEW');
  });

  it('omits propertyAgeBucket param when null', () => {
    const activeFilters = createBaseFilters();
    activeFilters.propertyAgeBucket = null;

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.propertyAgeBucket).toBeUndefined();
  });
});

// =============================================================================
// PROJECT FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - project', () => {
  it('maps project to project param', () => {
    const activeFilters = createBaseFilters();
    activeFilters.project = 'Marina Bay Suites';

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.project).toBe('Marina Bay Suites');
  });

  it('omits project param when null', () => {
    const activeFilters = createBaseFilters();
    activeFilters.project = null;

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    expect(params.project).toBeUndefined();
  });
});

// =============================================================================
// FACT FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - factFilter', () => {
  it('includes priceRange when includeFactFilter is true', () => {
    const activeFilters = createBaseFilters();
    const factFilter = { priceRange: { min: 500000, max: 2000000 } };

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      factFilter,
      {},
      { includeFactFilter: true }
    );

    expect(params.priceMin).toBe(500000);
    expect(params.priceMax).toBe(2000000);
  });

  it('omits priceRange when includeFactFilter is false (default)', () => {
    const activeFilters = createBaseFilters();
    const factFilter = { priceRange: { min: 500000, max: 2000000 } };

    const params = buildApiParamsFromState(activeFilters, activeFilters, factFilter);

    expect(params.priceMin).toBeUndefined();
    expect(params.priceMax).toBeUndefined();
  });

  it('handles partial priceRange with includeFactFilter', () => {
    const activeFilters = createBaseFilters();
    const factFilter = { priceRange: { min: 500000, max: null } };

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      factFilter,
      {},
      { includeFactFilter: true }
    );

    expect(params.priceMin).toBe(500000);
    expect(params.priceMax).toBeUndefined();
  });
});

// =============================================================================
// ADDITIONAL PARAMS TESTS
// =============================================================================

describe('buildApiParamsFromState - additionalParams', () => {
  it('passes through additionalParams', () => {
    const activeFilters = createBaseFilters();

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      { groupBy: 'month', metrics: 'count,total_value' }
    );

    expect(params.groupBy).toBe('month');
    expect(params.metrics).toBe('count,total_value');
  });

  it('converts snake_case keys to camelCase', () => {
    const activeFilters = createBaseFilters();

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      { group_by: 'month', time_grain: 'quarter' }
    );

    expect(params.groupBy).toBe('month');
    expect(params.timeGrain).toBe('quarter');
    // Snake case keys should not exist
    expect(params.group_by).toBeUndefined();
    expect(params.time_grain).toBeUndefined();
  });

  it('preserves already camelCase keys', () => {
    const activeFilters = createBaseFilters();

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      { histogramBins: 20, showFullRange: true }
    );

    expect(params.histogramBins).toBe(20);
    expect(params.showFullRange).toBe(true);
  });
});

// =============================================================================
// COMBINED FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - combined filters', () => {
  it('builds params with multiple filters active', () => {
    const activeFilters = createBaseFilters();
    activeFilters.districts = ['D01', 'D09'];
    activeFilters.bedroomTypes = ['2', '3'];
    activeFilters.segments = ['CCR'];
    activeFilters.saleType = 'Resale';
    activeFilters.timeFilter = { type: 'preset', value: 'M6' };
    activeFilters.psfRange = { min: 1500, max: 2500 };
    activeFilters.tenure = 'Freehold';

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      { groupBy: 'month' }
    );

    expect(params.district).toBe('D01,D09');
    expect(params.bedroom).toBe('2,3');
    expect(params.segment).toBe('CCR');
    expect(params.saleType).toBe('Resale');
    expect(params.timeframe).toBe('M6');
    expect(params.psfMin).toBe(1500);
    expect(params.psfMax).toBe(2500);
    expect(params.tenure).toBe('Freehold');
    expect(params.groupBy).toBe('month');
  });

  it('handles real-world TimeTrendChart params', () => {
    // Simulates what TimeTrendChart would send
    const activeFilters = createBaseFilters();
    activeFilters.timeFilter = { type: 'preset', value: 'Y1' };
    activeFilters.segments = ['CCR', 'RCR'];
    activeFilters.bedroomTypes = ['2'];

    const params = buildApiParamsFromState(
      activeFilters,
      activeFilters,
      emptyFactFilter,
      { group_by: 'month', metrics: 'count,total_value', sale_type: 'Resale' }
    );

    expect(params.timeframe).toBe('Y1');
    expect(params.segment).toBe('CCR,RCR');
    expect(params.bedroom).toBe('2');
    expect(params.groupBy).toBe('month');
    expect(params.metrics).toBe('count,total_value');
    expect(params.saleType).toBe('Resale');
  });

  it('handles empty filter state (default)', () => {
    const activeFilters = createBaseFilters();

    const params = buildApiParamsFromState(activeFilters, activeFilters, emptyFactFilter);

    // Only timeframe should be set (from default Y1 preset)
    expect(params.timeframe).toBe('Y1');
    expect(params.district).toBeUndefined();
    expect(params.bedroom).toBeUndefined();
    expect(params.segment).toBeUndefined();
    expect(params.saleType).toBeUndefined();
    expect(params.psfMin).toBeUndefined();
    expect(params.psfMax).toBeUndefined();
    expect(params.sizeMin).toBeUndefined();
    expect(params.sizeMax).toBeUndefined();
    expect(params.tenure).toBeUndefined();
    expect(params.propertyAgeMin).toBeUndefined();
    expect(params.propertyAgeMax).toBeUndefined();
    expect(params.propertyAgeBucket).toBeUndefined();
    expect(params.project).toBeUndefined();
  });
});
