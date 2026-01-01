/**
 * Filter Storage Utilities
 *
 * Provides page-namespaced sessionStorage for filter persistence.
 * Each page has isolated filter state - selections don't leak across routes.
 *
 * P0 Guardrails:
 * - pageId validation with safe fallback (never undefined/empty)
 * - Storage versioning per page (auto-clear on version mismatch)
 * - Hydration state tracking (filtersReady flag)
 *
 * Key format: powerbi:<pageId>:<key>
 * Example: powerbi:market_overview:filters, powerbi:market_overview:timeGrouping
 *
 * /projects/:name Behavior:
 * All project detail pages share a single namespace `project_detail`.
 * This is intentional - project pages share the same filter UI and users
 * expect consistent filter state when browsing between projects.
 * If per-project isolation is needed later, change to:
 *   `project_detail:${encodeURIComponent(projectName)}`
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Current storage schema version.
 * Increment this when filter structure changes to auto-clear stale data.
 */
export const STORAGE_VERSION = 1;

/**
 * Safe fallback page ID when pathname is invalid/empty.
 * This prevents undefined keys in storage.
 */
export const FALLBACK_PAGE_ID = 'default';

/**
 * Storage keys used by the filter system.
 * Centralized here to avoid magic strings.
 *
 * NOTE: datePreset is now stored INSIDE the filters object,
 * not as a separate key. This simplifies persistence.
 */
export const STORAGE_KEYS = {
  VERSION: '_version',
  FILTERS: 'filters',        // Includes datePreset as a field
  TIME_GROUPING: 'timeGrouping',
  HYDRATED: '_hydrated',
};

// =============================================================================
// PAGE ID RESOLUTION
// =============================================================================

/**
 * Map pathname to stable page ID.
 * Uses stable IDs instead of raw pathnames for consistent keys.
 *
 * GUARDRAIL: Never returns undefined/empty string.
 *
 * @param {string} pathname - The URL pathname
 * @returns {string} Stable page ID (guaranteed non-empty)
 */
export function getPageIdFromPathname(pathname) {
  // GUARDRAIL: Handle invalid input
  if (!pathname || typeof pathname !== 'string') {
    console.warn('[storage] getPageIdFromPathname called with invalid pathname:', pathname);
    return FALLBACK_PAGE_ID;
  }

  // Normalize pathname (remove trailing slash, lowercase)
  const normalized = pathname.replace(/\/$/, '').toLowerCase();

  // GUARDRAIL: Empty after normalization
  if (!normalized || normalized === '/') {
    return FALLBACK_PAGE_ID;
  }

  // Map to stable page IDs
  const PAGE_ID_MAP = {
    '/market-overview': 'market_overview',
    '/district-overview': 'district_overview',
    '/new-launch-market': 'new_launch_market',
    '/supply-inventory': 'supply_inventory',
    '/explore': 'explore',
    '/value-check': 'value_check',
    '/exit-risk': 'exit_risk',
    '/methodology': 'methodology',
    // Legacy routes (for any remaining references)
    '/market-core': 'market_overview',
    '/primary-market': 'new_launch_market',
    '/district-deep-dive': 'district_overview',
    '/project-deep-dive': 'explore',
    '/value-parity': 'value_check',
    '/supply-insights': 'supply_inventory',
  };

  // Direct match
  if (PAGE_ID_MAP[normalized]) {
    return PAGE_ID_MAP[normalized];
  }

  // Handle dynamic routes: /projects/:name
  // All project pages share one namespace (see module docstring for rationale)
  if (normalized.startsWith('/projects/')) {
    return 'project_detail';
  }

  // Fallback: convert pathname to snake_case ID
  const fallback = normalized.replace(/^\//, '').replace(/[/-]/g, '_');
  return fallback || FALLBACK_PAGE_ID;
}

/**
 * Validate pageId and return safe value.
 * Use this before any storage operation.
 *
 * @param {string} pageId - The page identifier to validate
 * @returns {string} Valid page ID (guaranteed non-empty)
 */
export function validatePageId(pageId) {
  if (!pageId || typeof pageId !== 'string' || pageId.trim() === '') {
    console.warn('[storage] Invalid pageId, using fallback:', pageId);
    return FALLBACK_PAGE_ID;
  }
  return pageId;
}

// =============================================================================
// STORAGE KEY GENERATION
// =============================================================================

/**
 * Generate a namespaced storage key.
 *
 * @param {string} pageId - The page identifier
 * @param {string} key - The filter key (e.g., 'filters', 'datePreset')
 * @returns {string} Namespaced storage key
 */
export function getFilterStorageKey(pageId, key) {
  const safePageId = validatePageId(pageId);
  return `powerbi:${safePageId}:${key}`;
}

// =============================================================================
// VERSION MANAGEMENT
// =============================================================================

/**
 * Check if page storage is at current version.
 * If not, clears all storage for that page (prevents stale data bugs).
 *
 * @param {string} pageId - The page identifier
 * @returns {boolean} True if version matches (storage is valid)
 */
export function checkStorageVersion(pageId) {
  if (typeof window === 'undefined') return true;

  const safePageId = validatePageId(pageId);

  try {
    const versionKey = getFilterStorageKey(safePageId, STORAGE_KEYS.VERSION);
    const storedVersion = sessionStorage.getItem(versionKey);

    if (storedVersion === null) {
      // First time - set version
      sessionStorage.setItem(versionKey, String(STORAGE_VERSION));
      return true;
    }

    const version = parseInt(storedVersion, 10);
    if (version !== STORAGE_VERSION) {
      // Version mismatch - clear page namespace and set new version
      console.warn(`[storage] Version mismatch for ${safePageId}: stored=${version}, current=${STORAGE_VERSION}. Clearing.`);
      clearFilterStorage(safePageId);
      sessionStorage.setItem(versionKey, String(STORAGE_VERSION));
      return false;
    }

    return true;
  } catch {
    return true; // Fail open - don't block on storage errors
  }
}

// =============================================================================
// READ/WRITE OPERATIONS
// =============================================================================

/**
 * Read from namespaced sessionStorage.
 * Automatically checks version before reading.
 *
 * @param {string} pageId - The page identifier
 * @param {string} key - The filter key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Parsed value or default
 */
export function readFilterStorage(pageId, key, defaultValue = null) {
  if (typeof window === 'undefined') return defaultValue;

  const safePageId = validatePageId(pageId);

  // Check version first (may clear stale data)
  checkStorageVersion(safePageId);

  try {
    const storageKey = getFilterStorageKey(safePageId, key);
    const saved = sessionStorage.getItem(storageKey);
    if (saved === null) return defaultValue;
    return JSON.parse(saved);
  } catch {
    return defaultValue;
  }
}

/**
 * Write to namespaced sessionStorage.
 *
 * @param {string} pageId - The page identifier
 * @param {string} key - The filter key
 * @param {*} value - Value to store (will be JSON stringified)
 */
export function writeFilterStorage(pageId, key, value) {
  if (typeof window === 'undefined') return;

  const safePageId = validatePageId(pageId);

  try {
    const storageKey = getFilterStorageKey(safePageId, key);
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore storage errors (quota exceeded, private browsing)
  }
}

// =============================================================================
// HYDRATION STATE
// =============================================================================

/**
 * Mark page as hydrated (filters have been restored from storage).
 * Use this to prevent double-fetch flicker.
 *
 * @param {string} pageId - The page identifier
 */
export function markHydrated(pageId) {
  writeFilterStorage(pageId, STORAGE_KEYS.HYDRATED, true);
}

/**
 * Check if page has been hydrated this session.
 *
 * @param {string} pageId - The page identifier
 * @returns {boolean} True if already hydrated
 */
export function isHydrated(pageId) {
  return readFilterStorage(pageId, STORAGE_KEYS.HYDRATED, false) === true;
}

// =============================================================================
// CLEAR OPERATIONS
// =============================================================================

/**
 * Clear all filter storage for a specific page.
 * Called by reset button and on version mismatch.
 *
 * @param {string} pageId - The page identifier
 */
export function clearFilterStorage(pageId) {
  if (typeof window === 'undefined') return;

  const safePageId = validatePageId(pageId);
  const prefix = `powerbi:${safePageId}:`;
  const keysToRemove = [];

  // Find all keys for this page
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }

  // Remove them
  keysToRemove.forEach((key) => sessionStorage.removeItem(key));

  // Re-set version after clearing
  const versionKey = getFilterStorageKey(safePageId, STORAGE_KEYS.VERSION);
  sessionStorage.setItem(versionKey, String(STORAGE_VERSION));
}

/**
 * Alias for clearFilterStorage (semantic naming for reset button).
 *
 * @param {string} pageId - The page identifier
 */
export function clearPageNamespace(pageId) {
  clearFilterStorage(pageId);
}
