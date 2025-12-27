/**
 * Data Adapters - Centralized data transformation layer
 *
 * Adapters provide:
 * - Schema validation (dev-only)
 * - Data normalization (v1/v2 compatibility)
 * - Common transformation patterns
 * - Sorting utilities
 *
 * Usage:
 * ```jsx
 * import { transformTimeSeries, sortByPeriod } from '../adapters';
 * ```
 */

export {
  // Validation
  validateRow,
  validateResponse,
  assertKnownVersion,
  // Sorting
  comparePeriods,
  sortByPeriod,
  // Time series transformations
  transformTimeSeries,
  transformTimeSeriesByRegion,
  // Compression analysis transformations
  transformCompressionSeries,
  calculateCompressionScore,
  calculateHistoricalBaseline,
  calculateAverageSpreads,
  detectMarketSignals,
  detectInversionZones,
  // Distribution / histogram transformations
  transformDistributionSeries,
  formatPrice,
  formatPriceRange,
  findBinIndex,
  // New vs Resale transformations
  transformNewVsResaleSeries,
  // Growth dumbbell transformations
  transformGrowthDumbbellSeries,
  // Transaction list transformations
  transformTransactionsList,
  // Observability
  logFetchDebug,
  logTransformError,
  // Beads Chart
  transformBeadsChartSeries,
  filterBedroomDatasets,
} from './aggregateAdapter';
