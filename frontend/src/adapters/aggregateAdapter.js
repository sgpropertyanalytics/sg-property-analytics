/**
 * Aggregate Data Adapter - Centralized data transformation for charts
 *
 * RE-EXPORT MODULE: This file re-exports from ./aggregate/ for backwards compatibility.
 * New code should import directly from './adapters/aggregate'.
 *
 * Module Structure (in ./aggregate/):
 * - validation.js: Schema validation helpers
 * - sorting.js: Period sorting utilities
 * - timeSeries.js: Time series transforms
 * - compression.js: Compression/spread analysis
 * - distribution.js: Histogram/distribution helpers
 * - chartTransforms.js: Chart-specific transforms
 * - transactions.js: Transaction table adapter
 * - observability.js: Debug logging utilities
 */

// Re-export everything from the modular structure
export {
  // Validation
  isDev,
  isTest,
  assertKnownVersion,
  validateRow,
  validateResponse,
  // Sorting
  comparePeriods,
  sortByPeriod,
  // Time Series
  transformTimeSeries,
  transformTimeSeriesByRegion,
  // Compression
  transformCompressionSeries,
  calculateCompressionScore,
  calculateHistoricalBaseline,
  calculateAverageSpreads,
  detectMarketSignals,
  calculateSpreadPercentiles,
  detectInversionZones,
  // Distribution / Histogram
  formatPrice,
  formatPriceRange,
  transformDistributionSeries,
  findBinIndex,
  // Chart-specific transforms
  transformNewVsResaleSeries,
  transformGrowthDumbbellSeries,
  // Transactions
  transformTransactionsList,
  // Observability
  logFetchDebug,
  logTransformError,
  // Beads Chart
  transformBeadsChartSeries,
  filterBedroomDatasets,
  // Z-Score Oscillator
  transformOscillatorSeries,
  calculateZScoreStats,
  getZScoreLabel,
  getZScoreShortLabel,
  getZScoreColor,
  calculateRollingAverage,
} from './aggregate';

// Re-export default for backwards compatibility
export { default } from './aggregate';
