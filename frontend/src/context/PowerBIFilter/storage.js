/**
 * Filter Storage Utilities
 *
 * Provides page-namespaced sessionStorage for filter persistence.
 * Each page has isolated filter state - selections don't leak across routes.
 *
 * Key format: powerbi:<pageId>:<key>
 * Example: powerbi:market_overview:filters, powerbi:district_overview:datePreset
 */

/**
 * Map pathname to stable page ID.
 * Uses stable IDs instead of raw pathnames for consistent keys.
 *
 * @param {string} pathname - The URL pathname
 * @returns {string} Stable page ID
 */
export function getPageIdFromPathname(pathname) {
  // Normalize pathname (remove trailing slash, lowercase)
  const normalized = pathname.replace(/\/$/, '').toLowerCase();

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

  // Handle dynamic routes (e.g., /projects/:name)
  if (normalized.startsWith('/projects/')) {
    return 'project_detail';
  }

  // Fallback: convert pathname to snake_case ID
  return normalized.replace(/^\//, '').replace(/[/-]/g, '_') || 'default';
}

/**
 * Generate a namespaced storage key.
 *
 * @param {string} pageId - The page identifier
 * @param {string} key - The filter key (e.g., 'filters', 'datePreset')
 * @returns {string} Namespaced storage key
 */
export function getFilterStorageKey(pageId, key) {
  return `powerbi:${pageId}:${key}`;
}

/**
 * Read from namespaced sessionStorage.
 *
 * @param {string} pageId - The page identifier
 * @param {string} key - The filter key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Parsed value or default
 */
export function readFilterStorage(pageId, key, defaultValue = null) {
  if (typeof window === 'undefined') return defaultValue;

  try {
    const storageKey = getFilterStorageKey(pageId, key);
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

  try {
    const storageKey = getFilterStorageKey(pageId, key);
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore storage errors (quota exceeded, private browsing)
  }
}

/**
 * Clear all filter storage for a specific page.
 *
 * @param {string} pageId - The page identifier
 */
export function clearFilterStorage(pageId) {
  if (typeof window === 'undefined') return;

  const prefix = `powerbi:${pageId}:`;
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
}

/**
 * Storage keys used by the filter system.
 * Centralized here to avoid magic strings.
 */
export const STORAGE_KEYS = {
  FILTERS: 'filters',
  DATE_PRESET: 'datePreset',
  TIME_GROUPING: 'timeGrouping',
};
