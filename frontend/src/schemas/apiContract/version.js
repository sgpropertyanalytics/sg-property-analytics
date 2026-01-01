/**
 * API Contract Versioning
 *
 * Defines supported API versions and version assertion helpers.
 * Must match backend/api/contracts/contract_schema.py
 */

import { IS_DEV, IS_TEST } from '../../config/env';

// =============================================================================
// VERSION CONSTANTS
// =============================================================================

export const API_CONTRACT_VERSIONS = {
  V2: 'v2',
  V3: 'v3',
};

export const SUPPORTED_API_CONTRACT_VERSIONS = new Set([
  API_CONTRACT_VERSIONS.V2,
  API_CONTRACT_VERSIONS.V3,
]);

// Current expected version from API
export const CURRENT_API_CONTRACT_VERSION = API_CONTRACT_VERSIONS.V3;

// Backwards compatibility alias
export const API_CONTRACT_VERSION = CURRENT_API_CONTRACT_VERSION;

// =============================================================================
// VERSION ASSERTION
// =============================================================================

/**
 * Assert that the API contract version is known.
 *
 * Behavior by environment:
 * - TEST mode: Throws an error (fails CI if adapter doesn't handle new version)
 * - DEV mode: Warns in console but continues
 * - PROD mode: Silent (graceful degradation)
 *
 * @param {Object} meta - Response meta object containing apiContractVersion
 * @returns {boolean} True if version is known, false otherwise
 * @throws {Error} In test mode when version is unknown
 *
 * @example
 * const isKnown = assertKnownVersion(response.meta);
 * // In test: throws if version is 'v999' or unknown
 * // In dev: logs warning
 * // In prod: returns false silently
 */
export function assertKnownVersion(meta) {
  const version = meta?.apiContractVersion;

  if (!SUPPORTED_API_CONTRACT_VERSIONS.has(version)) {
    // In test mode, fail hard to catch contract drift in CI
    if (IS_TEST) {
      throw new Error(
        `[API CONTRACT] Unknown apiContractVersion: ${version}. ` +
        `Supported versions: ${Array.from(SUPPORTED_API_CONTRACT_VERSIONS).join(', ')}. ` +
        `Update SUPPORTED_API_CONTRACT_VERSIONS or handle the new version in adapters.`
      );
    }

    // In dev mode, warn but don't throw (developer visibility)
    if (IS_DEV) {
      console.warn(
        `[API CONTRACT] Unknown apiContractVersion: ${version}`,
        meta
      );
    }

    // Prod: silent graceful degradation
    return false;
  }

  return true;
}
