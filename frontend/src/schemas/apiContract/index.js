/**
 * API Contract Schema v3 - Single Source of Truth
 *
 * Defines the stable API interface between backend and frontend.
 * Must match backend/schemas/api_contract.py
 *
 * Module Structure:
 * - version.js: API contract versioning and version assertion
 * - enums.js: All enum values, labels, and type-checking helpers
 * - transactionFields.js: Transaction field constants and accessor
 * - aggregateFields.js: Aggregate field constants and period helpers
 * - dashboardFields.js: Dashboard field constants and panel normalizers
 * - params.js: API parameter helpers
 * - filterOptions.js: Filter options normalization
 *
 * Version History:
 * - v1: Legacy snake_case fields only
 * - v2: Added camelCase fields, enum normalization
 * - v3: Stabilization release - no breaking changes, version flag for deprecation safety
 */

// =============================================================================
// VERSION
// =============================================================================

export {
  API_CONTRACT_VERSIONS,
  SUPPORTED_API_CONTRACT_VERSIONS,
  CURRENT_API_CONTRACT_VERSION,
  API_CONTRACT_VERSION,
  assertKnownVersion,
} from './version';

// =============================================================================
// ENUMS
// =============================================================================

export {
  // Sale Type
  SaleType,
  SaleTypeLabels,
  isSaleType,
  getSaleTypeLabel,
  // Tenure
  Tenure,
  TenureLabels,
  TenureLabelsShort,
  getTenureLabel,
  isTenure,
  // Region
  Region,
  RegionLabels,
  // Floor Level
  FloorLevel,
  FloorLevelDB,
  FloorLevelLabels,
  FloorLevelLabelsShort,
  isFloorLevel,
  getFloorLevelLabel,
  // Property Age Bucket
  PropertyAgeBucket,
  PropertyAgeBucketLabels,
  PropertyAgeBucketLabelsShort,
  isPropertyAgeBucket,
  getPropertyAgeBucketLabel,
  // Premium Trend
  PremiumTrend,
  PremiumTrendLabels,
  isPremiumTrend,
  // Bedroom
  Bedroom,
} from './enums';

// =============================================================================
// TRANSACTION FIELDS
// =============================================================================

export {
  TxnField,
  getTxnField,
} from './transactionFields';

// =============================================================================
// AGGREGATE FIELDS
// =============================================================================

export {
  AggField,
  getAggField,
  getPeriod,
  getPeriodGrain,
  hasValidPeriod,
} from './aggregateFields';

// =============================================================================
// DASHBOARD FIELDS
// =============================================================================

export {
  DashboardField,
  getDashboardField,
  normalizeSummaryPanel,
  normalizeTimeSeriesRow,
  normalizeLocationRow,
  normalizeBedroomMixRow,
  normalizeSaleTypeRow,
} from './dashboardFields';

// =============================================================================
// API PARAMETERS
// =============================================================================

export {
  toApiParams,
  V2_SCHEMA_PARAM,
} from './params';

// =============================================================================
// FILTER OPTIONS
// =============================================================================

export {
  normalizeFilterOptions,
} from './filterOptions';
