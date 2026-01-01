/**
 * Aggregate Data Adapter - Centralized data transformation for charts
 *
 * This adapter provides:
 * - Schema validation (dev-only warnings)
 * - Period normalization and sorting
 * - Common transformation patterns for time-series charts
 * - Type-safe field access
 *
 * RULE: "Charts must only consume adapter output"
 *
 * Usage:
 * ```jsx
 * import { transformTimeSeries, sortByPeriod } from '../adapters/aggregate';
 *
 * const { data, loading, error } = useAbortableQuery(async (signal) => {
 *   const response = await getAggregate(params, { signal });
 *   // Note: apiClient interceptor unwraps envelope, so response.data is the inner data
 *   return transformTimeSeries(response.data, 'quarter');
 * }, [filterKey]);
 * ```
 *
 * Module Structure:
 * - validation.js: Schema validation helpers (assertKnownVersion, validateRow, validateResponse)
 * - sorting.js: Period sorting utilities (comparePeriods, sortByPeriod)
 * - timeSeries.js: Time series transforms (transformTimeSeries, transformTimeSeriesByRegion)
 * - compression.js: Compression/spread analysis
 * - distribution.js: Histogram/distribution helpers
 * - chartTransforms.js: Chart-specific transforms (newVsResale, growthDumbbell)
 * - transactions.js: Transaction table adapter
 * - observability.js: Debug logging utilities
 */

// Import everything locally first
import {
  isDev,
  isTest,
  assertKnownVersion,
  validateRow,
  validateResponse,
  validateResponseGrain,
} from './validation';

import { comparePeriods, sortByPeriod } from './sorting';

import { transformTimeSeries, transformTimeSeriesByRegion } from './timeSeries';

import {
  transformCompressionSeries,
  calculateCompressionScore,
  calculateHistoricalBaseline,
  calculateAverageSpreads,
  detectMarketSignals,
  calculateSpreadPercentiles,
  detectInversionZones,
} from './compression';

import {
  formatPrice,
  formatPriceRange,
  transformDistributionSeries,
  findBinIndex,
} from './distribution';

import {
  transformNewVsResaleSeries,
  transformGrowthDumbbellSeries,
} from './chartTransforms';

import { transformTransactionsList } from './transactions';

import { logFetchDebug, logTransformError } from './observability';

import {
  transformBeadsChartSeries,
  filterBedroomDatasets,
} from './beadsChart';

import {
  transformOscillatorSeries,
  calculateZScoreStats,
  getZScoreLabel,
  getZScoreShortLabel,
  getZScoreColor,
  calculateRollingAverage,
} from './oscillator';

import {
  transformPriceRangeMatrix,
  formatPriceShort,
  formatPsf,
  getBudgetZoneStyle,
} from './priceRange';

import {
  transformDistrictComparison,
  truncateProjectName,
} from './districtComparison';

import {
  transformNewLaunchTimeline,
  formatPeriodLabel,
} from './newLaunchTimeline';

import {
  transformNewLaunchAbsorption,
  is2020Period,
} from './newLaunchAbsorption';

// Named exports
export {
  // Validation
  isDev,
  isTest,
  assertKnownVersion,
  validateRow,
  validateResponse,
  validateResponseGrain,
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
  // Price Range Matrix
  transformPriceRangeMatrix,
  formatPriceShort,
  formatPsf,
  getBudgetZoneStyle,
  // District Comparison
  transformDistrictComparison,
  truncateProjectName,
  // New Launch Timeline
  transformNewLaunchTimeline,
  formatPeriodLabel,
  // New Launch Absorption
  transformNewLaunchAbsorption,
  is2020Period,
};

// Default export for backwards compatibility
export default {
  // Version gate
  assertKnownVersion,
  // Validation
  validateRow,
  validateResponse,
  validateResponseGrain,
  // Sorting
  comparePeriods,
  sortByPeriod,
  // Transformations
  transformTimeSeries,
  transformTimeSeriesByRegion,
  transformCompressionSeries,
  transformDistributionSeries,
  transformNewVsResaleSeries,
  transformGrowthDumbbellSeries,
  transformTransactionsList,
  // Compression analysis
  calculateCompressionScore,
  calculateAverageSpreads,
  detectMarketSignals,
  calculateSpreadPercentiles,
  detectInversionZones,
  // Distribution helpers
  formatPrice,
  formatPriceRange,
  findBinIndex,
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
  // Price Range Matrix
  transformPriceRangeMatrix,
  formatPriceShort,
  formatPsf,
  getBudgetZoneStyle,
  // District Comparison
  transformDistrictComparison,
  truncateProjectName,
  // New Launch Timeline
  transformNewLaunchTimeline,
  formatPeriodLabel,
  // New Launch Absorption
  transformNewLaunchAbsorption,
  is2020Period,
};
