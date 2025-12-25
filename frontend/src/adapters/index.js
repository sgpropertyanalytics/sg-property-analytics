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
  calculateAverageSpreads,
  detectMarketSignals,
  detectInversionZones,
  // Observability
  logFetchDebug,
  logTransformError,
} from './aggregateAdapter';
