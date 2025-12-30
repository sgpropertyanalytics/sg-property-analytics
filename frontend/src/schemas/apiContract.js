/**
 * API Contract Schema v3 - Single Source of Truth
 *
 * RE-EXPORT MODULE: This file re-exports from ./apiContract/ for backwards compatibility.
 * New code should import directly from './schemas/apiContract'.
 *
 * Module Structure (in ./apiContract/):
 * - version.js: API contract versioning and version assertion
 * - enums.js: All enum values, labels, and type-checking helpers
 * - transactionFields.js: Transaction field constants and accessor
 * - aggregateFields.js: Aggregate field constants and period helpers
 * - dashboardFields.js: Dashboard field constants and panel normalizers
 * - params.js: API parameter helpers
 * - filterOptions.js: Filter options normalization
 */

// Re-export everything from the modular structure
export {
  // Version
  API_CONTRACT_VERSIONS,
  SUPPORTED_API_CONTRACT_VERSIONS,
  CURRENT_API_CONTRACT_VERSION,
  API_CONTRACT_VERSION,
  assertKnownVersion,
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
  // Transaction Fields
  TxnField,
  getTxnField,
  // KPI Fields
  KpiField,
  getKpiField,
  // Aggregate Fields
  AggField,
  getAggField,
  getPeriod,
  getPeriodGrain,
  hasValidPeriod,
  // Dashboard Fields
  DashboardField,
  getDashboardField,
  DashboardMetaField,
  getDashboardMetaField,
  normalizeSummaryPanel,
  normalizeTimeSeriesRow,
  normalizeLocationRow,
  normalizeBedroomMixRow,
  normalizeSaleTypeRow,
  // New vs Resale
  NewVsResaleField,
  getNewVsResaleField,
  // Budget Heatmap
  BudgetHeatmapField,
  BudgetHeatmapRowField,
  BudgetHeatmapMetaField,
  getBudgetHeatmapField,
  getBudgetHeatmapRowField,
  getBudgetHeatmapMetaField,
  // Floor Liquidity
  FloorLiquidityField,
  FloorLiquidityMetaField,
  getFloorLiquidityField,
  getFloorLiquidityMetaField,
  // Supply
  SupplyField,
  SupplyMetaField,
  getSupplyField,
  getSupplyMetaField,
  // GLS
  GlsAllField,
  getGlsAllField,
  // Upcoming Launches
  UpcomingLaunchesField,
  getUpcomingLaunchesField,
  // Hot Projects
  HotProjectsField,
  getHotProjectsField,
  // Deal Checker
  DealCheckerField,
  ProjectNamesField,
  getDealCheckerField,
  getProjectNamesField,
  // Project Inventory
  ProjectInventoryField,
  getProjectInventoryField,
  // Price Bands
  PriceBandsField,
  getPriceBandsField,
  // Exit Queue
  ExitQueueField,
  normalizeExitQueueResponse,
  // API Parameters
  toApiParams,
  // Filter Options
  normalizeFilterOptions,
} from './apiContract/index';
