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
 *   return transformTimeSeries(response.data.data, 'quarter');
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
 * - psfByPriceBand.js: PSF by price band transforms
 */

// Import everything locally first
import {
  isDev,
  isTest,
  assertKnownVersion,
  validateRow,
  validateResponse,
} from './validation';

import { comparePeriods, sortByPeriod } from './sorting';

import { transformTimeSeries, transformTimeSeriesByRegion } from './timeSeries';

import {
  transformCompressionSeries,
  calculateCompressionScore,
  calculateAverageSpreads,
  detectMarketSignals,
  detectInversionZones,
} from './compression';

import {
  formatPrice,
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
  transformPsfByPriceBand,
  toPsfByPriceBandChartData,
} from './psfByPriceBand';

// Named exports
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
  calculateAverageSpreads,
  detectMarketSignals,
  detectInversionZones,
  // Distribution / Histogram
  formatPrice,
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
  // PSF by Price Band
  transformPsfByPriceBand,
  toPsfByPriceBandChartData,
};

// Default export for backwards compatibility
export default {
  // Version gate
  assertKnownVersion,
  // Validation
  validateRow,
  validateResponse,
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
  transformPsfByPriceBand,
  toPsfByPriceBandChartData,
  // Compression analysis
  calculateCompressionScore,
  calculateAverageSpreads,
  detectMarketSignals,
  detectInversionZones,
  // Distribution helpers
  formatPrice,
  findBinIndex,
  // Observability
  logFetchDebug,
  logTransformError,
};
