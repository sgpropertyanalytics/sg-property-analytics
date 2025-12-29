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
import { getContract } from '../../generated/apiContract';

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Check if a value is already in {value, label} format.
 */
const isValueLabelFormat = (item) =>
  item && typeof item === 'object' && 'value' in item && 'label' in item;

const filterOptionsContract = getContract('filter-options');
const filterOptionsFields = filterOptionsContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!filterOptionsFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing filter-options field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing filter-options field: ${fieldName}`);
    }
  }
  return fieldName;
};

/**
 * Safe wrapper for array.map() - catches errors and returns empty array
 */
const safeMap = (arr, mapFn, fallback = []) => {
  if (!arr || !Array.isArray(arr)) return fallback;
  try {
    return arr.map(mapFn);
  } catch (err) {
    console.error('[filterOptions] safeMap error:', err);
    return fallback;
  }
};

/**
 * Normalize sale types to {value, label} format.
 * v1: ['New Sale', 'Resale'] → v2 format with enums
 * v2: [{value: 'new_sale', label: 'New Sale'}] → pass through
 */
const normalizeSaleTypes = (saleTypes) => {
  if (!saleTypes || !Array.isArray(saleTypes)) return [];

  return safeMap(saleTypes, (item) => {
    if (isValueLabelFormat(item)) return item;

    // v1 format: DB string
    const dbToEnum = {
      'New Sale': SaleType.NEW_SALE,
      'Resale': SaleType.RESALE,
      'Sub Sale': SaleType.SUB_SALE,
    };
    return {
      value: dbToEnum[item] || item,
      label: typeof item === 'string' ? item : String(item),
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

  return safeMap(tenures, (item) => {
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
    const itemStr = typeof item === 'string' ? item : String(item);
    return {
      value: dbToEnum[itemStr] || itemStr,
      label: shortLabels[itemStr] || itemStr,
      fullLabel: itemStr, // Keep original for tooltips
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

  return safeMap(districts, (item) => {
    if (isValueLabelFormat(item)) return item;
    const itemStr = typeof item === 'string' ? item : String(item);
    return { value: itemStr, label: itemStr };
  });
};

/**
 * Normalize bedrooms to {value, label} format.
 * v1: [1, 2, 3, 4, 5] → [{value: 1, label: '1'}, ..., {value: '5_plus', label: '5+'}]
 * v2: [{value: 1, label: '1'}, ...] → pass through
 */
const normalizeBedrooms = (bedrooms) => {
  if (!bedrooms || !Array.isArray(bedrooms)) return [];

  return safeMap(bedrooms, (item) => {
    if (isValueLabelFormat(item)) return item;

    // v1 format: integer
    const num = typeof item === 'number' ? item : parseInt(item, 10);
    if (isNaN(num)) {
      return { value: item, label: String(item) };
    }
    if (num >= 5) {
      return { value: Bedroom.FIVE_PLUS, label: '5+' };
    }
    return { value: num, label: String(num) };
  });
};

/**
 * Normalize property age buckets to {value, label} format.
 */
const normalizePropertyAgeBuckets = (buckets) => {
  if (!buckets || !Array.isArray(buckets)) return [];
  return safeMap(buckets, (item) => {
    if (isValueLabelFormat(item)) return item;
    // Raw enum string → create {value, label}
    const itemStr = typeof item === 'string' ? item : String(item);
    return {
      value: itemStr,
      label: PropertyAgeBucketLabels[itemStr] || itemStr,
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
  // Defensive: return safe defaults if apiResponse is falsy or not an object
  if (!apiResponse || typeof apiResponse !== 'object') {
    console.warn('[filterOptions] Invalid apiResponse, returning defaults');
    return {
      saleTypes: [],
      tenures: [],
      regions: [],
      districts: [],
      bedrooms: [],
      marketSegments: [],
      propertyAgeBuckets: [],
      dateRange: { min: null, max: null },
      psfRange: { min: null, max: null },
      sizeRange: { min: null, max: null },
      districtsRaw: [],
      regionsLegacy: null,
      apiContractVersion: 'v1',
    };
  }

  try {
    const saleTypesField = resolveField('saleTypes');
    const tenuresField = resolveField('tenures');
    const regionsField = resolveField('regions');
    const districtsField = resolveField('districts');
    const bedroomsField = resolveField('bedrooms');
    const marketSegmentsField = resolveField('marketSegments');
    const propertyAgeBucketsField = resolveField('propertyAgeBuckets');
    const dateRangeField = resolveField('dateRange');
    const psfRangeField = resolveField('psfRange');
    const sizeRangeField = resolveField('sizeRange');

    // Prefer v2 fields (camelCase), fallback to v1 (snake_case)
    const saleTypesRaw = apiResponse[saleTypesField] || apiResponse.sale_types || [];
    const tenuresRaw = apiResponse[tenuresField] || [];
    const regionsRaw = apiResponse[regionsField] || apiResponse.regions_legacy || {};
    const districtsRaw = apiResponse[districtsField] || [];
    const bedroomsRaw = apiResponse[bedroomsField] || [];
    const marketSegmentsRaw = apiResponse[marketSegmentsField] || regionsRaw;
    const propertyAgeBucketsRaw = apiResponse[propertyAgeBucketsField] || apiResponse.property_age_buckets || [];

    // Date/PSF/Size ranges (same structure in v1 and v2)
    const dateRange = apiResponse[dateRangeField] || apiResponse.date_range || { min: null, max: null };
    const psfRange = apiResponse[psfRangeField] || apiResponse.psf_range || { min: null, max: null };
    const sizeRange = apiResponse[sizeRangeField] || apiResponse.size_range || { min: null, max: null };

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
      districtsRaw: safeMap(
        Array.isArray(districtsRaw) ? districtsRaw : [],
        (d) => (isValueLabelFormat(d) ? d.value : d)
      ),
      // Keep raw regions dict for legacy compatibility
      regionsLegacy: apiResponse.regions_legacy || (typeof regionsRaw === 'object' && !Array.isArray(regionsRaw) ? regionsRaw : null),
      // API contract version
      apiContractVersion: apiResponse.apiContractVersion || 'v1',
    };
  } catch (err) {
    // Catastrophic fallback - log error and return safe defaults
    console.error('[filterOptions] normalizeFilterOptions crashed:', err);
    return {
      saleTypes: [],
      tenures: [],
      regions: [],
      districts: [],
      bedrooms: [],
      marketSegments: [],
      propertyAgeBuckets: [],
      dateRange: { min: null, max: null },
      psfRange: { min: null, max: null },
      sizeRange: { min: null, max: null },
      districtsRaw: [],
      regionsLegacy: null,
      apiContractVersion: 'v1',
    };
  }
};
