/**
 * Filter Options Normalization
 *
 * Normalizes /api/filter-options responses to consistent {value, label} format.
 * Handles both v1 (raw values) and v2 (structured) formats.
 */

import {
  SaleType,
  Tenure,
  Bedroom,
  PropertyAgeBucketLabels,
} from './enums';

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Check if a value is already in {value, label} format.
 */
const isValueLabelFormat = (item) =>
  item && typeof item === 'object' && 'value' in item && 'label' in item;

/**
 * Normalize sale types to {value, label} format.
 * v1: ['New Sale', 'Resale'] → v2 format with enums
 * v2: [{value: 'new_sale', label: 'New Sale'}] → pass through
 */
const normalizeSaleTypes = (saleTypes) => {
  if (!saleTypes || !Array.isArray(saleTypes)) return [];

  return saleTypes.map((item) => {
    if (isValueLabelFormat(item)) return item;

    // v1 format: DB string
    const dbToEnum = {
      'New Sale': SaleType.NEW_SALE,
      'Resale': SaleType.RESALE,
      'Sub Sale': SaleType.SUB_SALE,
    };
    return {
      value: dbToEnum[item] || item,
      label: item,
    };
  });
};

/**
 * Normalize tenures to {value, label} format.
 * v1: ['Freehold', '99-year'] → v2 format with enums
 * v2: [{value: 'freehold', label: 'Freehold'}] → pass through
 */
const normalizeTenures = (tenures) => {
  if (!tenures || !Array.isArray(tenures)) return [];

  return tenures.map((item) => {
    if (isValueLabelFormat(item)) return item;

    // v1 format: DB string
    const dbToEnum = {
      'Freehold': Tenure.FREEHOLD,
      '99-year': Tenure.LEASEHOLD_99,
      '999-year': Tenure.LEASEHOLD_999,
    };
    const shortLabels = {
      'Freehold': 'FH',
      '99-year': '99yr',
      '999-year': '999yr',
    };
    return {
      value: dbToEnum[item] || item,
      label: shortLabels[item] || item,
      fullLabel: item, // Keep original for tooltips
    };
  });
};

/**
 * Normalize regions to {value, label} format.
 * v1: {CCR: [...], RCR: [...]} → [{value: 'ccr', label: 'CCR'}]
 * v2: [{value: 'ccr', label: 'CCR'}] → pass through
 */
const normalizeRegions = (regions) => {
  // Check if already v2 array format
  if (Array.isArray(regions) && regions.length > 0 && isValueLabelFormat(regions[0])) {
    return regions;
  }

  // v1 format: object {CCR: [...], RCR: [...], OCR: [...]}
  if (regions && typeof regions === 'object' && !Array.isArray(regions)) {
    return ['CCR', 'RCR', 'OCR']
      .filter((key) => key in regions)
      .map((key) => ({
        value: key.toLowerCase(),
        label: key,
      }));
  }

  return [];
};

/**
 * Normalize districts to {value, label} format.
 * v1: ['D01', 'D02'] → [{value: 'D01', label: 'D01'}]
 * v2: [{value: 'D01', label: 'D01'}] → pass through
 */
const normalizeDistricts = (districts) => {
  if (!districts || !Array.isArray(districts)) return [];

  return districts.map((item) => {
    if (isValueLabelFormat(item)) return item;
    return { value: item, label: item };
  });
};

/**
 * Normalize bedrooms to {value, label} format.
 * v1: [1, 2, 3, 4, 5] → [{value: 1, label: '1'}, ..., {value: '5_plus', label: '5+'}]
 * v2: [{value: 1, label: '1'}, ...] → pass through
 */
const normalizeBedrooms = (bedrooms) => {
  if (!bedrooms || !Array.isArray(bedrooms)) return [];

  return bedrooms.map((item) => {
    if (isValueLabelFormat(item)) return item;

    // v1 format: integer
    if (item >= 5) {
      return { value: Bedroom.FIVE_PLUS, label: '5+' };
    }
    return { value: item, label: String(item) };
  });
};

/**
 * Normalize property age buckets to {value, label} format.
 */
const normalizePropertyAgeBuckets = (buckets) => {
  if (!buckets || !Array.isArray(buckets)) return [];
  return buckets.map((item) => {
    if (isValueLabelFormat(item)) return item;
    // Raw enum string → create {value, label}
    return {
      value: item,
      label: PropertyAgeBucketLabels[item] || item,
    };
  });
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Normalize filter options from API response.
 * Handles both v1 (raw values) and v2 ({value, label}) formats.
 *
 * @param {Object} apiResponse - Raw API response from /api/filter-options
 * @returns {Object} Normalized filter options with {value, label} arrays
 *
 * @example
 * const normalized = normalizeFilterOptions(apiResponse);
 * // normalized.saleTypes = [{value: 'new_sale', label: 'New Sale'}, ...]
 * // normalized.regions = [{value: 'ccr', label: 'CCR'}, ...]
 */
export const normalizeFilterOptions = (apiResponse) => {
  if (!apiResponse) return null;

  // Prefer v2 fields (camelCase), fallback to v1 (snake_case)
  const saleTypesRaw = apiResponse.saleTypes || apiResponse.sale_types || [];
  const tenuresRaw = apiResponse.tenures || [];
  const regionsRaw = apiResponse.regions || apiResponse.regions_legacy || {};
  const districtsRaw = apiResponse.districts || [];
  const bedroomsRaw = apiResponse.bedrooms || [];
  const marketSegmentsRaw = apiResponse.marketSegments || regionsRaw;
  const propertyAgeBucketsRaw = apiResponse.propertyAgeBuckets || apiResponse.property_age_buckets || [];

  // Date/PSF/Size ranges (same structure in v1 and v2)
  const dateRange = apiResponse.dateRange || apiResponse.date_range || { min: null, max: null };
  const psfRange = apiResponse.psfRange || apiResponse.psf_range || { min: null, max: null };
  const sizeRange = apiResponse.sizeRange || apiResponse.size_range || { min: null, max: null };

  return {
    saleTypes: normalizeSaleTypes(saleTypesRaw),
    tenures: normalizeTenures(tenuresRaw),
    regions: normalizeRegions(regionsRaw),
    districts: normalizeDistricts(districtsRaw),
    bedrooms: normalizeBedrooms(bedroomsRaw),
    marketSegments: normalizeRegions(marketSegmentsRaw),
    propertyAgeBuckets: normalizePropertyAgeBuckets(propertyAgeBucketsRaw),
    dateRange,
    psfRange,
    sizeRange,
    // Keep raw districts list for legacy compatibility
    districtsRaw: Array.isArray(districtsRaw)
      ? districtsRaw.map((d) => (isValueLabelFormat(d) ? d.value : d))
      : [],
    // Keep raw regions dict for legacy compatibility
    regionsLegacy: apiResponse.regions_legacy || (typeof regionsRaw === 'object' && !Array.isArray(regionsRaw) ? regionsRaw : null),
    // API contract version
    apiContractVersion: apiResponse.apiContractVersion || 'v1',
  };
};
