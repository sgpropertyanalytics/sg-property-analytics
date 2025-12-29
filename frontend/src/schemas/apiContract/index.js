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
  PropertyAgeBucketTooltips,
  isPropertyAgeBucket,
  getPropertyAgeBucketLabel,
  // Premium Trend
  PremiumTrend,
  PremiumTrendLabels,
  isPremiumTrend,
  // Floor Direction
  FloorDirection,
  FloorDirectionLabels,
  isFloorDirection,
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
// KPI FIELDS
// =============================================================================

export {
  KpiField,
  getKpiField,
} from './kpiFields';

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
  DashboardMetaField,
  getDashboardMetaField,
  normalizeSummaryPanel,
  normalizeTimeSeriesRow,
  normalizeLocationRow,
  normalizeBedroomMixRow,
  normalizeSaleTypeRow,
} from './dashboardFields';

// =============================================================================
// NEW VS RESALE FIELDS
// =============================================================================

export {
  NewVsResaleField,
  getNewVsResaleField,
} from './newVsResaleFields';

// =============================================================================
// BUDGET HEATMAP FIELDS
// =============================================================================

export {
  BudgetHeatmapField,
  BudgetHeatmapRowField,
  BudgetHeatmapMetaField,
  getBudgetHeatmapField,
  getBudgetHeatmapRowField,
  getBudgetHeatmapMetaField,
} from './budgetHeatmapFields';

// =============================================================================
// FLOOR LIQUIDITY FIELDS
// =============================================================================

export {
  FloorLiquidityField,
  FloorLiquidityMetaField,
  getFloorLiquidityField,
  getFloorLiquidityMetaField,
} from './floorLiquidityFields';

// =============================================================================
// SUPPLY FIELDS
// =============================================================================

export {
  SupplyField,
  SupplyMetaField,
  getSupplyField,
  getSupplyMetaField,
} from './supplyFields';

// =============================================================================
// GLS FIELDS
// =============================================================================

export {
  GlsAllField,
  getGlsAllField,
} from './glsFields';

// =============================================================================
// UPCOMING LAUNCHES FIELDS
// =============================================================================

export {
  UpcomingLaunchesField,
  getUpcomingLaunchesField,
} from './upcomingLaunchFields';

// =============================================================================
// HOT PROJECTS FIELDS
// =============================================================================

export {
  HotProjectsField,
  getHotProjectsField,
} from './hotProjectsFields';

// =============================================================================
// DEAL CHECKER FIELDS
// =============================================================================

export {
  DealCheckerField,
  ProjectNamesField,
  getDealCheckerField,
  getProjectNamesField,
} from './dealCheckerFields';

// =============================================================================
// PROJECT INVENTORY FIELDS
// =============================================================================

export {
  ProjectInventoryField,
  getProjectInventoryField,
} from './projectInventoryFields';

// =============================================================================
// PRICE BANDS FIELDS
// =============================================================================

export {
  PriceBandsField,
  getPriceBandsField,
} from './priceBandsFields';

// =============================================================================
// EXIT QUEUE FIELDS
// =============================================================================

export {
  ExitQueueField,
  normalizeExitQueueResponse,
} from './exitQueueFields';

// =============================================================================
// API PARAMETERS
// =============================================================================

export {
  toApiParams,
} from './params';

// =============================================================================
// FILTER OPTIONS
// =============================================================================

export {
  normalizeFilterOptions,
} from './filterOptions';
