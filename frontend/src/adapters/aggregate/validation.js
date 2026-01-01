/**
 * Schema Validation Helpers
 *
 * Validates API responses and data rows.
 * - Version gate assertions (catches schema drift)
 * - Row validation (warns on missing fields)
 * - Response structure validation
 */

import {
  getAggField,
  SUPPORTED_API_CONTRACT_VERSIONS,
} from '../../schemas/apiContract';

// Environment flags
export const isDev = process.env.NODE_ENV === 'development';
export const isTest = process.env.NODE_ENV === 'test';

// Known API contract versions - derived from central source of truth
const KNOWN_VERSIONS = Array.from(SUPPORTED_API_CONTRACT_VERSIONS);

/**
 * Version gate assertion - warns or throws if API returns unknown/missing version.
 * Prevents "silent shape drift" by catching contract mismatches early.
 *
 * Behavior by environment:
 * - TEST mode: Throws an error (fails CI if adapter doesn't handle new version)
 * - DEV mode: Warns in console but continues
 * - PROD mode: No-op (graceful degradation)
 *
 * @param {Object} response - API response object
 * @param {string} endpoint - Endpoint name for error context
 * @throws {Error} In test mode when version is unknown or missing
 */
export const assertKnownVersion = (response, endpoint = 'unknown') => {
  // Skip all checks in production (graceful degradation)
  if (!isDev && !isTest) return;

  const version = response?.meta?.apiContractVersion || response?.meta?.schemaVersion;

  if (!version) {
    const message =
      `[API Version Gate] Missing apiContractVersion at ${endpoint}. ` +
      `Expected one of: ${KNOWN_VERSIONS.join(', ')}. ` +
      `Sample row keys: ${response?.data?.[0] ? Object.keys(response.data[0]).join(', ') : 'no data'}`;

    if (isTest) {
      throw new Error(message);
    }
    console.warn(message);
    return;
  }

  if (!KNOWN_VERSIONS.includes(version)) {
    const message =
      `[API Version Gate] Unknown version "${version}" at ${endpoint}. ` +
      `Known versions: ${KNOWN_VERSIONS.join(', ')}. ` +
      `This may indicate schema drift - update KNOWN_VERSIONS if intentional. ` +
      `Sample row keys: ${response?.data?.[0] ? Object.keys(response.data[0]).join(', ') : 'no data'}`;

    if (isTest) {
      throw new Error(message);
    }
    console.warn(message);
  }
};

/**
 * Validate that a row has required fields.
 * In dev mode, logs warnings for missing fields.
 *
 * @param {Object} row - Data row to validate
 * @param {string[]} requiredFields - Array of required field names
 * @param {string} context - Context string for error messages
 * @returns {boolean} True if valid
 */
export const validateRow = (row, requiredFields, context = 'row') => {
  if (!row) {
    if (isDev) console.warn(`[${context}] Null or undefined row`);
    return false;
  }

  const missing = requiredFields.filter((field) => {
    const value = getAggField(row, field);
    return value === undefined || value === null;
  });

  if (missing.length > 0 && isDev) {
    console.warn(`[${context}] Missing fields: ${missing.join(', ')}`, row);
  }

  return missing.length === 0;
};

/**
 * Validate response grain matches expected grain (fetch-site validation).
 *
 * DESIGN: This is the correct place for grain validation - at the fetch boundary,
 * only when status === 'success'. Unlike transform-layer validation, this won't
 * fire false positives when keepPreviousData shows stale data during refresh.
 *
 * Rules:
 * - Dev-only (no-op in production)
 * - Only validates when expectedGrain is provided (indicates time grouping)
 * - Warns once per response (checks first row only)
 * - Catches real contract violations (backend returning wrong grain)
 *
 * @param {Array} data - Raw data array from API response
 * @param {string|null} expectedGrain - Expected grain ('year'|'quarter'|'month'), or null to skip validation
 * @param {string} context - Component/endpoint name for warning context
 * @returns {boolean} True if valid (or skipped), false if mismatch
 *
 * @example
 * // In chart's fetch function, after successful response:
 * const rawData = response.data || [];
 * validateResponseGrain(rawData, timeGrouping, 'TimeTrendChart');
 * return transformTimeSeries(rawData);
 */
export const validateResponseGrain = (data, expectedGrain, context = 'unknown') => {
  // Skip in production (graceful degradation)
  if (!isDev && !isTest) return true;

  // Skip if no expected grain (request didn't include time grouping)
  if (!expectedGrain) return true;

  // Skip if no data
  if (!Array.isArray(data) || data.length === 0) return true;

  // Check first row's grain (warn once, not per row)
  const actualGrain = data[0]?.periodGrain;

  // Skip if response has no grain (non-time-grouped endpoint)
  if (!actualGrain) return true;

  // Validate grain match
  if (actualGrain !== expectedGrain) {
    const message =
      `[Grain Mismatch] ${context}: expected '${expectedGrain}' but got '${actualGrain}'. ` +
      `This may indicate a backend contract violation or incorrect query params.`;

    if (isTest) {
      // In test mode, just warn (don't throw - grain mismatches aren't fatal)
      console.warn(message);
    } else {
      console.warn(message);
    }
    return false;
  }

  return true;
};

/**
 * Validate API response structure.
 * In dev mode, logs warnings for invalid structure and checks version.
 *
 * @param {Object} response - API response
 * @param {string} context - Context string for error messages (also used as endpoint name for version gate)
 * @returns {boolean} True if valid
 */
export const validateResponse = (response, context = 'API') => {
  if (!response) {
    if (isDev) console.warn(`[${context}] Null response`);
    return false;
  }

  if (!Array.isArray(response.data)) {
    if (isDev) console.warn(`[${context}] Invalid response structure - expected data array`, response);
    return false;
  }

  // Version gate: Check API contract version
  assertKnownVersion(response, context);

  return true;
};
