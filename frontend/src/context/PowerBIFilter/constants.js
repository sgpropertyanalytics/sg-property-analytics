/**
 * PowerBI Filter Constants and Initial State
 *
 * Single source of truth for filter state defaults and constants.
 */

// ===== Time Grouping Constants =====
// Single source of truth for API mapping
// This is a VIEW CONTEXT control (not a filter) - controls how data is aggregated
export const TIME_GROUP_BY = {
  year: 'year',
  quarter: 'quarter',
  month: 'month',
};

// ===== Initial State Defaults =====

/**
 * Default sidebar filter state.
 * These are user-applied filters from the filter sidebar.
 */
export const INITIAL_FILTERS = {
  dateRange: { start: null, end: null },  // null = all
  districts: [],                           // empty = all
  bedroomTypes: [],                        // empty = all (supports 1,2,3,4,5)
  segments: [],                            // empty = all, can contain 'CCR', 'RCR', 'OCR'
  saleType: null,                          // null = all, 'New Sale' | 'Resale'
  psfRange: { min: null, max: null },      // null = no restriction
  sizeRange: { min: null, max: null },     // null = no restriction
  tenure: null,                            // null = all, 'Freehold' | '99-year' | '999-year'
  propertyAge: { min: null, max: null },   // null = no restriction, property age in years (legacy)
  propertyAgeBucket: null,                 // null = all, PropertyAgeBucket enum value
  project: null,                           // null = all, project name filter
};

/**
 * Default cross-filter state.
 * Applied when user clicks on a CATEGORICAL chart element (district, bedroom, etc.)
 */
export const INITIAL_CROSS_FILTER = {
  source: null,        // which chart applied it ('location', 'bedroom', 'price')
  dimension: null,     // 'district', 'region', 'bedroom', 'sale_type'
  value: null,         // 'D09', 'CCR', '3', etc.
};

/**
 * Default fact filter state.
 * Filters that only apply to FACT tables (Transaction Data Table).
 */
export const INITIAL_FACT_FILTER = {
  priceRange: { min: null, max: null },  // from Price Distribution chart click
};

/**
 * Default highlight state.
 * Applied when user clicks on a TIME chart element (year, quarter, month).
 */
export const INITIAL_HIGHLIGHT = {
  source: null,        // which chart applied it ('time')
  dimension: null,     // 'year', 'quarter', 'month'
  value: null,         // '2024', '2024-Q3', '2024-03', etc.
};

/**
 * Default drill path state.
 * Current granularity level for hierarchical dimensions.
 */
export const INITIAL_DRILL_PATH = {
  time: 'month',       // 'year' | 'quarter' | 'month'
  location: 'region',  // 'region' | 'district' (NO 'project' - that's drill-through)
};

/**
 * Default selected project state (drill-through only).
 */
export const INITIAL_SELECTED_PROJECT = {
  name: null,      // Project name
  district: null,  // District the project is in (for context)
};

/**
 * Default breadcrumbs state.
 */
export const INITIAL_BREADCRUMBS = {
  time: [],      // e.g., ['All', '2024', 'Q3']
  location: [],  // e.g., ['All', 'CCR', 'D09']
};

/**
 * Default filter options state.
 */
export const INITIAL_FILTER_OPTIONS = {
  // v2 normalized format: [{value, label}, ...]
  districts: [],
  regions: [],
  bedrooms: [],
  saleTypes: [],
  tenures: [],
  marketSegments: [],
  propertyAgeBuckets: [],
  // Ranges (same structure in v1/v2)
  dateRange: { min: null, max: null },
  psfRange: { min: null, max: null },
  sizeRange: { min: null, max: null },
  // Legacy compatibility fields
  districtsRaw: [],          // Raw district codes for existing logic
  regionsLegacy: null,       // {CCR: [...], RCR: [...], OCR: [...]} for legacy
  // State
  loading: true,
  error: null,
};

/**
 * Categorical dimensions that support cross-filtering.
 * NOTE: 'project' is NOT included - project is drill-through only.
 */
export const CATEGORICAL_DIMENSIONS = ['district', 'region', 'bedroom', 'sale_type'];

/**
 * Time drill levels.
 */
export const TIME_LEVELS = ['year', 'quarter', 'month'];

/**
 * Location drill levels.
 * NOTE: No 'project' - project is drill-through only.
 */
export const LOCATION_LEVELS = ['region', 'district'];
