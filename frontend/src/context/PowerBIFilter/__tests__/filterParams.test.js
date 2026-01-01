/**
 * Filter-to-API-Param Mapping Tests
 *
 * These tests verify that buildApiParamsFromState correctly transforms
 * frontend filter state into API query parameters.
 *
 * Key differences from timeFilter.test.js:
 * - timeFilter.test.js tests wiring (hooks call the right things)
 * - This file tests ACCURACY (specific filter values → correct API params)
 *
 * Coverage:
 * - Districts → district (comma-joined)
 * - Bedrooms → bedroom (comma-joined)
 * - Segments → segment (comma-joined)
 * - Sale type → saleType
 * - PSF range → psfMin/psfMax
 * - Size range → sizeMin/sizeMax
 * - Tenure → tenure
 * - Property age → propertyAgeMin/propertyAgeMax
 * - Property age bucket → propertyAgeBucket
 * - Project → project
 * - Fact filter → priceMin/priceMax (when includeFactFilter=true)
 * - excludeOwnDimension behavior
 * - excludeLocationDrill behavior
 */

import { describe, it, expect } from 'vitest';

import { INITIAL_FILTERS } from '../constants';
import { buildApiParamsFromState } from '../utils';

// =============================================================================
// TEST FIXTURES
// =============================================================================

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

const emptyFactFilter = { priceRange: { min: null, max: null } };

// =============================================================================
// DISTRICT FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - districts', () => {
  it('sends single district as-is', () => {
    const activeFilters = { ...baseFilters, districts: ['D01'] };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.district).toBe('D01');
  });

  it('comma-joins multiple districts', () => {
    const activeFilters = { ...baseFilters, districts: ['D01', 'D02', 'D09'] };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.district).toBe('D01,D02,D09');
  });

  it('does not send district when empty array', () => {
    const activeFilters = { ...baseFilters, districts: [] };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.district).toBeUndefined();
  });

  it('excludes district when excludeOwnDimension="district"', () => {
    const activeFilters = { ...baseFilters, districts: ['D01', 'D02'] };
    const params = buildApiParamsFromState(
      activeFilters,
      baseFilters,
      emptyFactFilter,
      {},
      { excludeOwnDimension: 'district' }
    );

    expect(params.district).toBeUndefined();
  });

  it('uses sidebar filters when excludeLocationDrill=true', () => {
    const sidebarFilters = { ...baseFilters, districts: ['D01'] };
    const activeFilters = { ...baseFilters, districts: ['D01', 'D02', 'D03'] };
    const params = buildApiParamsFromState(
      activeFilters,
      sidebarFilters,
      emptyFactFilter,
      {},
      { excludeLocationDrill: true }
    );

    expect(params.district).toBe('D01'); // Uses sidebar, not active
  });
});

// =============================================================================
// BEDROOM FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - bedrooms', () => {
  it('sends single bedroom type as-is', () => {
    const activeFilters = { ...baseFilters, bedroomTypes: ['1BR'] };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.bedroom).toBe('1BR');
  });

  it('comma-joins multiple bedroom types', () => {
    const activeFilters = { ...baseFilters, bedroomTypes: ['1BR', '2BR', '3BR'] };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.bedroom).toBe('1BR,2BR,3BR');
  });

  it('does not send bedroom when empty array', () => {
    const activeFilters = { ...baseFilters, bedroomTypes: [] };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.bedroom).toBeUndefined();
  });

  it('excludes bedroom when excludeOwnDimension="bedroom"', () => {
    const activeFilters = { ...baseFilters, bedroomTypes: ['1BR', '2BR'] };
    const params = buildApiParamsFromState(
      activeFilters,
      baseFilters,
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
  it('sends single segment as-is', () => {
    const activeFilters = { ...baseFilters, segments: ['CCR'] };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.segment).toBe('CCR');
  });

  it('comma-joins multiple segments', () => {
    const activeFilters = { ...baseFilters, segments: ['CCR', 'RCR', 'OCR'] };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.segment).toBe('CCR,RCR,OCR');
  });

  it('does not send segment when empty array', () => {
    const activeFilters = { ...baseFilters, segments: [] };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.segment).toBeUndefined();
  });

  it('excludes segment when excludeOwnDimension="segment"', () => {
    const activeFilters = { ...baseFilters, segments: ['CCR'] };
    const params = buildApiParamsFromState(
      activeFilters,
      baseFilters,
      emptyFactFilter,
      {},
      { excludeOwnDimension: 'segment' }
    );

    expect(params.segment).toBeUndefined();
  });

  it('uses sidebar filters when excludeLocationDrill=true', () => {
    const sidebarFilters = { ...baseFilters, segments: ['CCR'] };
    const activeFilters = { ...baseFilters, segments: ['CCR', 'RCR'] };
    const params = buildApiParamsFromState(
      activeFilters,
      sidebarFilters,
      emptyFactFilter,
      {},
      { excludeLocationDrill: true }
    );

    expect(params.segment).toBe('CCR'); // Uses sidebar, not active
  });
});

// =============================================================================
// SALE TYPE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - saleType', () => {
  it('sends saleType when set', () => {
    const activeFilters = { ...baseFilters, saleType: 'resale' };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.saleType).toBe('resale');
  });

  it('sends new_sale saleType', () => {
    const activeFilters = { ...baseFilters, saleType: 'new_sale' };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.saleType).toBe('new_sale');
  });

  it('does not send saleType when null', () => {
    const activeFilters = { ...baseFilters, saleType: null };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.saleType).toBeUndefined();
  });

  it('page-level saleType takes precedence over filter', () => {
    const activeFilters = { ...baseFilters, saleType: 'new_sale' };
    // additionalParams simulates page-level prop
    const additionalParams = { saleType: 'resale' };
    const params = buildApiParamsFromState(
      activeFilters,
      baseFilters,
      emptyFactFilter,
      additionalParams
    );

    expect(params.saleType).toBe('resale'); // Page wins
  });

  it('excludes saleType when excludeOwnDimension="sale_type"', () => {
    const activeFilters = { ...baseFilters, saleType: 'resale' };
    const params = buildApiParamsFromState(
      activeFilters,
      baseFilters,
      emptyFactFilter,
      {},
      { excludeOwnDimension: 'sale_type' }
    );

    expect(params.saleType).toBeUndefined();
  });
});

// =============================================================================
// PSF RANGE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - psfRange', () => {
  it('sends psfMin when min is set', () => {
    const activeFilters = { ...baseFilters, psfRange: { min: 1000, max: null } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.psfMin).toBe(1000);
    expect(params.psfMax).toBeUndefined();
  });

  it('sends psfMax when max is set', () => {
    const activeFilters = { ...baseFilters, psfRange: { min: null, max: 2000 } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.psfMin).toBeUndefined();
    expect(params.psfMax).toBe(2000);
  });

  it('sends both psfMin and psfMax when both set', () => {
    const activeFilters = { ...baseFilters, psfRange: { min: 1000, max: 2000 } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.psfMin).toBe(1000);
    expect(params.psfMax).toBe(2000);
  });

  it('does not send psf params when both null', () => {
    const activeFilters = { ...baseFilters, psfRange: { min: null, max: null } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.psfMin).toBeUndefined();
    expect(params.psfMax).toBeUndefined();
  });

  it('handles zero as valid psfMin', () => {
    const activeFilters = { ...baseFilters, psfRange: { min: 0, max: 1000 } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    // Note: 0 is falsy in JS, but should still be sent
    // This test documents current behavior - may need adjustment
    expect(params.psfMin).toBe(0);
  });
});

// =============================================================================
// SIZE RANGE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - sizeRange', () => {
  it('sends sizeMin when min is set', () => {
    const activeFilters = { ...baseFilters, sizeRange: { min: 500, max: null } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.sizeMin).toBe(500);
    expect(params.sizeMax).toBeUndefined();
  });

  it('sends sizeMax when max is set', () => {
    const activeFilters = { ...baseFilters, sizeRange: { min: null, max: 1500 } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.sizeMin).toBeUndefined();
    expect(params.sizeMax).toBe(1500);
  });

  it('sends both sizeMin and sizeMax when both set', () => {
    const activeFilters = { ...baseFilters, sizeRange: { min: 500, max: 1500 } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.sizeMin).toBe(500);
    expect(params.sizeMax).toBe(1500);
  });
});

// =============================================================================
// TENURE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - tenure', () => {
  it('sends tenure when set to freehold', () => {
    const activeFilters = { ...baseFilters, tenure: 'freehold' };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.tenure).toBe('freehold');
  });

  it('sends tenure when set to leasehold', () => {
    const activeFilters = { ...baseFilters, tenure: '99-year' };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.tenure).toBe('99-year');
  });

  it('does not send tenure when null', () => {
    const activeFilters = { ...baseFilters, tenure: null };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.tenure).toBeUndefined();
  });
});

// =============================================================================
// PROPERTY AGE FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - propertyAge', () => {
  it('sends propertyAgeMin when min is set', () => {
    const activeFilters = { ...baseFilters, propertyAge: { min: 0, max: null } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.propertyAgeMin).toBe(0);
    expect(params.propertyAgeMax).toBeUndefined();
  });

  it('sends propertyAgeMax when max is set', () => {
    const activeFilters = { ...baseFilters, propertyAge: { min: null, max: 10 } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.propertyAgeMin).toBeUndefined();
    expect(params.propertyAgeMax).toBe(10);
  });

  it('sends both propertyAgeMin and propertyAgeMax when both set', () => {
    const activeFilters = { ...baseFilters, propertyAge: { min: 5, max: 15 } };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.propertyAgeMin).toBe(5);
    expect(params.propertyAgeMax).toBe(15);
  });
});

// =============================================================================
// PROPERTY AGE BUCKET FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - propertyAgeBucket', () => {
  it('sends propertyAgeBucket when set', () => {
    const activeFilters = { ...baseFilters, propertyAgeBucket: 'new' };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.propertyAgeBucket).toBe('new');
  });

  it('does not send propertyAgeBucket when null', () => {
    const activeFilters = { ...baseFilters, propertyAgeBucket: null };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.propertyAgeBucket).toBeUndefined();
  });
});

// =============================================================================
// PROJECT FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - project', () => {
  it('sends project when set', () => {
    const activeFilters = { ...baseFilters, project: 'Marina Bay Sands' };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.project).toBe('Marina Bay Sands');
  });

  it('handles project names with special characters', () => {
    const activeFilters = { ...baseFilters, project: "D'Leedon" };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.project).toBe("D'Leedon");
  });

  it('does not send project when null', () => {
    const activeFilters = { ...baseFilters, project: null };
    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.project).toBeUndefined();
  });
});

// =============================================================================
// FACT FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - factFilter', () => {
  it('does not include priceRange by default', () => {
    const factFilter = { priceRange: { min: 500000, max: 2000000 } };
    const params = buildApiParamsFromState(baseFilters, baseFilters, factFilter, {});

    expect(params.priceMin).toBeUndefined();
    expect(params.priceMax).toBeUndefined();
  });

  it('includes priceRange when includeFactFilter=true', () => {
    const factFilter = { priceRange: { min: 500000, max: 2000000 } };
    const params = buildApiParamsFromState(
      baseFilters,
      baseFilters,
      factFilter,
      {},
      { includeFactFilter: true }
    );

    expect(params.priceMin).toBe(500000);
    expect(params.priceMax).toBe(2000000);
  });

  it('handles partial priceRange with includeFactFilter', () => {
    const factFilter = { priceRange: { min: 500000, max: null } };
    const params = buildApiParamsFromState(
      baseFilters,
      baseFilters,
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
  it('includes additionalParams in output', () => {
    const additionalParams = { groupBy: 'month', metrics: 'count,median_psf' };
    const params = buildApiParamsFromState(
      baseFilters,
      baseFilters,
      emptyFactFilter,
      additionalParams
    );

    expect(params.groupBy).toBe('month');
    expect(params.metrics).toBe('count,median_psf');
  });

  it('additionalParams do not override filter values', () => {
    const activeFilters = { ...baseFilters, districts: ['D01'] };
    const additionalParams = { district: 'D99' }; // Should this override?
    const params = buildApiParamsFromState(
      activeFilters,
      baseFilters,
      emptyFactFilter,
      additionalParams
    );

    // Document actual behavior - filter should win for districts
    // Note: This may vary - check actual implementation
    expect(params.district).toBe('D01');
  });
});

// =============================================================================
// COMBINED FILTER TESTS
// =============================================================================

describe('buildApiParamsFromState - combined filters', () => {
  it('handles multiple filters together', () => {
    const activeFilters = {
      ...baseFilters,
      districts: ['D01', 'D09'],
      bedroomTypes: ['2BR', '3BR'],
      saleType: 'resale',
      psfRange: { min: 1500, max: 2500 },
      timeFilter: { type: 'preset', value: 'Y1' },
    };

    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.district).toBe('D01,D09');
    expect(params.bedroom).toBe('2BR,3BR');
    expect(params.saleType).toBe('resale');
    expect(params.psfMin).toBe(1500);
    expect(params.psfMax).toBe(2500);
    expect(params.timeframe).toBe('Y1');
  });

  it('handles all filter types simultaneously', () => {
    const activeFilters = {
      ...baseFilters,
      districts: ['D01'],
      bedroomTypes: ['1BR'],
      segments: ['CCR'],
      saleType: 'resale',
      psfRange: { min: 1000, max: 2000 },
      sizeRange: { min: 500, max: 1000 },
      tenure: 'freehold',
      propertyAge: { min: 0, max: 5 },
      propertyAgeBucket: 'new',
      project: 'Test Project',
      timeFilter: { type: 'custom', start: '2024-01-01', end: '2024-12-31' },
    };

    const params = buildApiParamsFromState(activeFilters, baseFilters, emptyFactFilter, {});

    expect(params.district).toBe('D01');
    expect(params.bedroom).toBe('1BR');
    expect(params.segment).toBe('CCR');
    expect(params.saleType).toBe('resale');
    expect(params.psfMin).toBe(1000);
    expect(params.psfMax).toBe(2000);
    expect(params.sizeMin).toBe(500);
    expect(params.sizeMax).toBe(1000);
    expect(params.tenure).toBe('freehold');
    expect(params.propertyAgeMin).toBe(0);
    expect(params.propertyAgeMax).toBe(5);
    expect(params.propertyAgeBucket).toBe('new');
    expect(params.project).toBe('Test Project');
    expect(params.dateFrom).toBe('2024-01-01');
    expect(params.dateTo).toBe('2024-12-31');
    expect(params.timeframe).toBeUndefined(); // Custom mode, no timeframe
  });
});
