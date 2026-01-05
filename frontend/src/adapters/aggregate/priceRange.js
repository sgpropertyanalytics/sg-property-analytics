/**
 * Price Range Adapter - Transforms /api/aggregate response into price corridor matrix
 *
 * Used by PriceRangeMatrix to show "fair price range" for each bedroom × age band cell.
 *
 * API call: /api/aggregate?group_by=bedroom,age_band&metrics=count,price_25th,price_75th,median_price,psf_25th,psf_75th,min_price,max_price
 *
 * Output structure:
 * {
 *   matrix: {
 *     'new_sale': { 1: { q1, median, q3, count, ... }, 2: {...}, ... },
 *     'recently_top': { 1: {...}, ... },
 *     ...
 *   },
 *   ageBands: ['new_sale', 'recently_top', 'young_resale', 'resale', 'mature_resale'],
 *   bedrooms: [1, 2, 3, 4, 5],
 *   totalCount: N
 * }
 */

import { assertKnownVersion } from './validation';
import { BEDROOM_ORDER_NUMERIC } from '../../constants';

// K-anonymity threshold (same as budget heatmap)
const MIN_CELL_COUNT = 5;

/**
 * Age band order for matrix display.
 * Matches canonical PropertyAgeBucket from backend/api/contracts/contract_schema.py
 */
const AGE_BAND_ORDER = [
  'new_sale',
  'recently_top',  // 4-7 years
  'young_resale',  // 8-14 years
  'resale',        // 15-24 years
  'mature_resale', // 25+ years
  'freehold',      // Freehold properties
];

/**
 * Transform /api/aggregate response into price corridor matrix
 *
 * @param {Object} response - API response with data array
 * @param {Object} options - Transform options
 * @param {number} options.budget - User's target budget (for position marker)
 * @returns {Object} Matrix structure for PriceRangeMatrix
 */
export function transformPriceRangeMatrix(response, options = {}) {
  const { budget = null } = options;

  // Validate API version
  if (response?.meta?.apiVersion) {
    assertKnownVersion(response.meta.apiVersion);
  }

  const data = response?.data || [];
  const meta = response?.meta || {};

  // Initialize empty matrix
  const matrix = {};
  for (const band of AGE_BAND_ORDER) {
    matrix[band] = {};
    for (const br of BEDROOM_ORDER_NUMERIC) {
      matrix[band][br] = null; // null = no data
    }
  }

  let totalCount = 0;

  // Populate matrix from API response
  for (const row of data) {
    const ageBand = row.ageBand;
    const bedroom = row.bedroomCount;
    const count = row.count || 0;

    // Skip unknown bands or invalid bedroom
    if (!ageBand || ageBand === 'unknown' || !bedroom) continue;
    if (!matrix[ageBand]) continue;

    totalCount += count;

    // Apply K-anonymity suppression
    if (count < MIN_CELL_COUNT) {
      matrix[ageBand][bedroom] = {
        suppressed: true,
        count,
      };
      continue;
    }

    // Extract price metrics
    const priceQ1 = row.price25th;
    const priceMedian = row.medianPrice;
    const priceQ3 = row.price75th;
    const priceMin = row.minPrice;
    const priceMax = row.maxPrice;

    // Extract PSF metrics
    const psfQ1 = row.psf25th;
    const psfQ3 = row.psf75th;

    // Calculate budget position (where does user's budget fall?)
    let budgetZone = null;
    if (budget && priceQ1 && priceQ3) {
      if (budget < priceQ1) {
        budgetZone = 'bargain';
      } else if (budget <= priceQ3) {
        budgetZone = 'fair';
      } else {
        budgetZone = 'premium';
      }
    }

    matrix[ageBand][bedroom] = {
      // Price quartiles
      priceQ1: priceQ1 ? Math.round(priceQ1) : null,
      priceMedian: priceMedian ? Math.round(priceMedian) : null,
      priceQ3: priceQ3 ? Math.round(priceQ3) : null,
      priceMin: priceMin ? Math.round(priceMin) : null,
      priceMax: priceMax ? Math.round(priceMax) : null,

      // PSF range
      psfQ1: psfQ1 ? Math.round(psfQ1) : null,
      psfQ3: psfQ3 ? Math.round(psfQ3) : null,

      // Sample size
      count,

      // Budget position
      budgetZone,

      // K-anonymity flag
      suppressed: false,
    };
  }

  // Filter out age bands with no data
  const activeBands = AGE_BAND_ORDER.filter(band => {
    return BEDROOM_ORDER_NUMERIC.some(br => matrix[band][br] !== null);
  });

  return {
    matrix,
    ageBands: activeBands,
    bedrooms: BEDROOM_ORDER_NUMERIC,
    totalCount,
    meta: {
      filtersApplied: meta.filtersApplied || {},
      cacheHit: meta.cacheHit ?? false,
    },
  };
}

/**
 * Format price for display
 * @param {number} price - Price in SGD
 * @returns {string} Formatted price (e.g., "$1.5M", "$850K")
 */
export function formatPriceShort(price) {
  if (price === null || price === undefined) return '-';

  if (price >= 1000000) {
    return `$${(price / 1000000).toFixed(1)}M`;
  }
  if (price >= 1000) {
    return `$${Math.round(price / 1000)}K`;
  }
  return `$${price}`;
}

/**
 * Format PSF for display
 * @param {number} psf - Price per sqft
 * @returns {string} Formatted PSF (e.g., "$1,850")
 */
export function formatPsf(psf) {
  if (psf === null || psf === undefined) return '-';
  return `$${psf.toLocaleString()}`;
}

/**
 * Get budget zone label and styling
 * @param {string} zone - 'bargain' | 'fair' | 'premium'
 * @returns {Object} { label, color, bgColor }
 */
export function getBudgetZoneStyle(zone) {
  switch (zone) {
    case 'bargain':
      return {
        label: 'Good deal',
        color: '#166534', // green-800
        bgColor: '#DCFCE7', // green-100
      };
    case 'fair':
      return {
        label: 'Fair price',
        color: '#1E40AF', // blue-800
        bgColor: '#DBEAFE', // blue-100
      };
    case 'premium':
      return {
        label: 'Above market',
        color: '#9A3412', // orange-800
        bgColor: '#FEF3C7', // amber-100
      };
    default:
      return {
        label: '',
        color: '#6B7280',
        bgColor: 'transparent',
      };
  }
}
