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
  // Unified time filter - single source of truth for time selection
  // Type 'preset': value is timeframe ID ('M3' | 'M6' | 'Y1' | 'Y3' | 'Y5' | 'all')
  // Type 'custom': start/end are ISO date strings ('2024-01-01')
  timeFilter: { type: 'preset', value: 'Y1' },
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
 * Default time filter value (preset mode with 1 year).
 * Used for reset operations and fallbacks.
 */
export const DEFAULT_TIME_FILTER = { type: 'preset', value: 'Y1' };

/**
 * Validates timeFilter structure.
 * Returns true if valid preset or custom type with appropriate fields.
 */
export function isValidTimeFilter(tf) {
  if (!tf || typeof tf !== 'object') return false;
  if (tf.type === 'preset') return typeof tf.value === 'string';
  if (tf.type === 'custom') return true; // start/end can be null
  return false;
}

/**
 * Safely gets timeFilter with fallback to default.
 * Use this instead of direct access for consistency.
 */
export function getTimeFilter(filters) {
  const tf = filters?.timeFilter;
  return isValidTimeFilter(tf) ? tf : DEFAULT_TIME_FILTER;
}

/**
 * Default fact filter state.
 * Filters that only apply to FACT tables (Transaction Data Table).
 * NOTE: Kept as dead code for safety during cross-filter removal.
 */
export const INITIAL_FACT_FILTER = {
  priceRange: { min: null, max: null },
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
  // Ranges
  dateRange: { min: null, max: null },
  psfRange: { min: null, max: null },
  sizeRange: { min: null, max: null },
  // Raw values for existing UI logic
  districtsRaw: [],
  regionsLegacy: null,
  // State
  loading: true,
  error: null,
};

/**
 * Time drill levels.
 */
export const TIME_LEVELS = ['year', 'quarter', 'month'];

/**
 * Location drill levels.
 * NOTE: No 'project' - project is drill-through only.
 */
export const LOCATION_LEVELS = ['region', 'district'];
