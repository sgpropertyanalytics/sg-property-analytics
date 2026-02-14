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

import { logFetchDebug } from './observability';

import {
  transformBeadsChartSeries,
} from './beadsChart';

import {
  transformOscillatorSeries,
  calculateZScoreStats,
  getZScoreLabel,
  getZScoreShortLabel,
  getZScoreColor,
  calculateRollingAverage,
  DEFAULT_BASELINE_STATS,
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

import {
  aggregateTimeSeriesByGrain,
  monthToQuarter,
  monthToYear,
} from './timeAggregation';

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
  // Beads Chart
  transformBeadsChartSeries,
  // Z-Score Oscillator
  transformOscillatorSeries,
  calculateZScoreStats,
  getZScoreLabel,
  getZScoreShortLabel,
  getZScoreColor,
  calculateRollingAverage,
  DEFAULT_BASELINE_STATS,
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
  // Client-side time aggregation (for instant grain toggle)
  aggregateTimeSeriesByGrain,
  monthToQuarter,
  monthToYear,
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
  // Distribution helpers
  formatPrice,
  formatPriceRange,
  findBinIndex,
  // Observability
  logFetchDebug,
  // Beads Chart
  transformBeadsChartSeries,
  // Z-Score Oscillator
  transformOscillatorSeries,
  calculateZScoreStats,
  getZScoreLabel,
  getZScoreShortLabel,
  getZScoreColor,
  calculateRollingAverage,
  DEFAULT_BASELINE_STATS,
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
  // Client-side time aggregation
  aggregateTimeSeriesByGrain,
  monthToQuarter,
  monthToYear,
};
