/**
 * DistrictLiquidityMap Utilities
 *
 * Pure functions for geometry calculations and styling.
 */

import { LIQUIDITY_FILLS } from './constants';

// =============================================================================
// GEOMETRY UTILITIES
// =============================================================================

/**
 * Calculate the centroid of a polygon using the "polylabel" algorithm.
 * Returns the visual center suitable for label placement.
 */
export function polylabel(polygon) {
  const ring = polygon[0];
  if (!ring || ring.length < 4) return null;

  let sumX = 0,
    sumY = 0,
    sumArea = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    const cross = x1 * y2 - x2 * y1;
    sumX += (x1 + x2) * cross;
    sumY += (y1 + y2) * cross;
    sumArea += cross;
  }

  if (sumArea === 0) {
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    return {
      lng: (Math.min(...xs) + Math.max(...xs)) / 2,
      lat: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }

  sumArea *= 3;
  return { lng: sumX / sumArea, lat: sumY / sumArea };
}

// =============================================================================
// LIQUIDITY STYLING
// =============================================================================

/**
 * Get fill color based on composite liquidity score (0-100).
 * Score tiers: Excellent (>=80), Good (>=60), Average (>=40), Below Avg (>=20), Poor (<20)
 */
export function getLiquidityFill(score) {
  if (score === null || score === undefined) return LIQUIDITY_FILLS.noData;
  if (score >= 80) return LIQUIDITY_FILLS.veryHigh;   // Excellent
  if (score >= 60) return LIQUIDITY_FILLS.high;       // Good
  if (score >= 40) return LIQUIDITY_FILLS.neutral;    // Average
  if (score >= 20) return LIQUIDITY_FILLS.low;        // Below Average
  return LIQUIDITY_FILLS.veryLow;                     // Poor
}

/**
 * Get dimmed fill color for spotlight effect (non-hovered districts).
 * Reduces opacity significantly for the "cinematic" dimming effect.
 */
export function getLiquidityFillDimmed(_score) {
  // Return very faded gray for all non-hovered districts
  return 'rgba(180, 180, 180, 0.25)';
}

/**
 * Get the border color for a score tier (for tethered callout).
 */
export function getTierBorderColor(tier) {
  switch (tier) {
    case 'Excellent':
      return '#213448'; // Deep Navy
    case 'Good':
      return '#547792'; // Ocean Blue
    case 'Average':
      return '#94B4C1'; // Sky Blue
    case 'Below Average':
      return '#EAE0CF'; // Sand
    case 'Poor':
      return '#d4c4a8'; // Darker Sand
    default:
      return '#cbd5e1'; // Slate-300
  }
}

// =============================================================================
// SCORE STYLING (shared by HoverCard and LiquidityRankingTable)
// =============================================================================

/**
 * Get CSS classes for score badge based on score value.
 */
export function getScoreBadgeStyle(score) {
  if (score === null || score === undefined) return 'bg-gray-100 text-gray-500';
  if (score >= 80) return 'bg-emerald-100 text-emerald-700'; // Excellent
  if (score >= 60) return 'bg-emerald-50 text-emerald-600'; // Good
  if (score >= 40) return 'bg-amber-50 text-amber-700'; // Average
  if (score >= 20) return 'bg-orange-50 text-orange-600'; // Below Average
  return 'bg-rose-50 text-rose-600'; // Poor
}

/**
 * Get text label for score value.
 */
export function getScoreLabel(score) {
  if (score === null || score === undefined) return '-';
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  if (score >= 20) return 'Below Avg';
  return 'Poor';
}

// =============================================================================
// BADGE STYLING (for tables)
// =============================================================================

/**
 * Get CSS classes for region badge.
 */
export function getRegionBadge(region) {
  switch (region) {
    case 'CCR':
      return 'bg-brand-navy text-white';
    case 'RCR':
      return 'bg-brand-blue text-white';
    case 'OCR':
      return 'bg-brand-sky text-brand-navy';
    default:
      return 'bg-gray-200 text-gray-600';
  }
}

/**
 * Get CSS classes for fragility badge.
 */
export function getFragilityBadge(fragility) {
  switch (fragility) {
    case 'Robust':
      return 'bg-emerald-100 text-emerald-700';
    case 'Moderate':
      return 'bg-amber-100 text-amber-700';
    case 'Fragile':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

/**
 * Get CSS classes for score tier badge (table version).
 */
export function getTierBadgeStyle(tier) {
  switch (tier) {
    case 'Excellent':
      return 'bg-brand-navy text-white';
    case 'Good':
      return 'bg-brand-blue text-white';
    case 'Average':
      return 'bg-brand-sky text-brand-navy';
    case 'Below Average':
      return 'bg-brand-sand text-brand-blue';
    case 'Poor':
      return 'bg-brand-sand text-brand-sky';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

/**
 * Convert fragility label to spread label.
 */
export function getSpreadLabel(fragilityLabel) {
  if (fragilityLabel === 'Robust') return 'Wide';
  if (fragilityLabel === 'Moderate') return 'Medium';
  if (fragilityLabel === 'Fragile') return 'Narrow';
  return '-';
}
