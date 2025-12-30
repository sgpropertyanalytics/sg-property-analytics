/**
 * Canonical Timeframe Specification
 *
 * IMPORTANT: Frontend only stores IDs and labels for UI rendering.
 * Backend is the SOLE source of truth for date resolution.
 * Frontend passes timeframe ID → Backend resolves to dates.
 *
 * Usage:
 *   import { TIMEFRAME_OPTIONS, normalizeTimeframeId } from '../constants/timeframes';
 *
 *   // Get options for dropdown
 *   TIMEFRAME_OPTIONS.map(opt => <option value={opt.id}>{opt.label}</option>)
 *
 *   // Normalize legacy URL values
 *   const normalized = normalizeTimeframeId('12m'); // Returns 'Y1'
 */

// Canonical timeframe IDs
export const TIMEFRAME_IDS = {
  ALL: 'all',
  M3: 'M3',
  M6: 'M6',
  Y1: 'Y1',
  Y3: 'Y3',
  Y5: 'Y5',
};

// Timeframe options for UI dropdowns
// Y1 = last 12 months (default for performance)
export const TIMEFRAME_OPTIONS = [
  { id: 'M3', label: '3M', fullLabel: '3 Months' },
  { id: 'M6', label: '6M', fullLabel: '6 Months' },
  { id: 'Y1', label: '1Y', fullLabel: '1 Year' },
  { id: 'Y3', label: '3Y', fullLabel: '3 Years' },
  { id: 'Y5', label: '5Y', fullLabel: '5 Years' },
  { id: 'all', label: 'All', fullLabel: 'All Time' },
];

export const DEFAULT_TIMEFRAME_ID = 'Y1';  // Default to last 12 months for performance

// Back-compat mapping for old URL values (frontend only normalizes ID, not dates)
const LEGACY_MAP = {
  '3m': 'M3', '6m': 'M6', '12m': 'Y1', '1y': 'Y1',
  '2y': 'Y3', '3y': 'Y3', '5y': 'Y5',
  'all': 'all',  // Keep 'all' as-is for "all time" queries
};

/**
 * Normalize timeframe ID for consistent API calls.
 * Does NOT compute dates - that's backend's job.
 *
 * @param {string} id - Timeframe ID (canonical or legacy)
 * @returns {string} Canonical ID (all, M3, M6, Y1, Y3, Y5)
 */
export function normalizeTimeframeId(id) {
  if (!id) return DEFAULT_TIMEFRAME_ID;  // Y1 = last 12 months
  const upper = id.toUpperCase();
  const lower = id.toLowerCase();
  // Check 'all' first
  if (lower === 'all') return 'all';
  return LEGACY_MAP[lower] || TIMEFRAME_IDS[upper] || DEFAULT_TIMEFRAME_ID;
}

/**
 * Get timeframe option by ID (for UI display purposes).
 *
 * @param {string} id - Timeframe ID
 * @returns {Object} Timeframe option { id, label, fullLabel }
 */
export function getTimeframeOption(id) {
  const normalized = normalizeTimeframeId(id);
  return TIMEFRAME_OPTIONS.find(o => o.id === normalized)
    || TIMEFRAME_OPTIONS.find(o => o.id === DEFAULT_TIMEFRAME_ID);
}

/**
 * Check if a timeframe ID is valid (canonical or legacy).
 *
 * @param {string} id - Timeframe ID to check
 * @returns {boolean} True if valid
 */
export function isValidTimeframe(id) {
  if (!id) return false;
  const lower = id.toLowerCase();
  const upper = id.toUpperCase();
  return lower in LEGACY_MAP || upper in TIMEFRAME_IDS;
}
