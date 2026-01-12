/**
 * DistrictLiquidityMap Constants
 *
 * Configuration, colors, and filter options for the liquidity map.
 */

import { SINGAPORE_CENTER } from '../../../data/singaporeDistrictsGeoJSON';
import {
  BEDROOM_FILTER_OPTIONS,
  PERIOD_FILTER_OPTIONS,
  SALE_TYPE_FILTER_OPTIONS,
} from '../../../constants';

// =============================================================================
// MAP CONFIGURATION
// =============================================================================

export const MAP_CONFIG = {
  center: { longitude: SINGAPORE_CENTER.lng, latitude: SINGAPORE_CENTER.lat },
  defaultZoom: 10.8,
  maxBounds: [
    [103.55, 1.22],  // Limit south to avoid showing too much sea
    [104.15, 1.50],
  ],
  minZoom: 10,
  maxZoom: 15,
};

export const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';

// =============================================================================
// COLOR PALETTE
// =============================================================================

export const COLORS = {
  deepNavy: '#213448',
  oceanBlue: '#547792',
  skyBlue: '#94B4C1',
  sand: '#EAE0CF',
};

// Liquidity colors (based on composite liquidity score 0-100)
export const LIQUIDITY_FILLS = {
  veryHigh: 'rgba(33, 52, 72, 0.60)',    // Deep Navy - Score >= 80 (Excellent)
  high: 'rgba(84, 119, 146, 0.50)',      // Ocean Blue - Score >= 60 (Good)
  neutral: 'rgba(148, 180, 193, 0.35)',  // Sky Blue - Score >= 40 (Average)
  low: 'rgba(234, 224, 207, 0.50)',      // Sand - Score >= 20 (Below Avg)
  veryLow: 'rgba(234, 224, 207, 0.70)',  // Sand stronger - Score < 20 (Poor)
  noData: 'rgba(200, 200, 200, 0.15)',   // Gray - no data
};

// =============================================================================
// FILTER OPTIONS (from centralized constants)
// =============================================================================

export const BEDROOM_OPTIONS = BEDROOM_FILTER_OPTIONS;
export const PERIOD_OPTIONS = PERIOD_FILTER_OPTIONS;
export const SALE_TYPE_OPTIONS = SALE_TYPE_FILTER_OPTIONS;

// =============================================================================
// MARKER POSITIONING
// =============================================================================

// Manual marker offsets for crowded central districts
export const MARKER_OFFSETS = {
  D09: { lng: -0.008, lat: 0.006 },
  D10: { lng: 0.008, lat: 0.003 },
  D11: { lng: 0.005, lat: -0.006 },
  D01: { lng: -0.003, lat: 0.004 },
  D02: { lng: 0.004, lat: -0.003 },
};
