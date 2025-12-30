/**
 * Filter Options Normalization
 *
 * Normalizes /api/filter-options responses to consistent {value, label} format.
 */

import { Bedroom, PropertyAgeBucketLabels } from './enums';
import { getContract } from '../../generated/apiContract';
import { API_CONTRACT_VERSION } from './version';

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
 */
const normalizeSaleTypes = (saleTypes) => {
  if (!saleTypes || !Array.isArray(saleTypes)) return [];

  return safeMap(saleTypes, (item) => {
    if (isValueLabelFormat(item)) return item;
    return {
      value: item,
      label: typeof item === 'string' ? item : String(item),
    };
  });
};

/**
 * Normalize tenures to {value, label} format.
 */
const normalizeTenures = (tenures) => {
  if (!tenures || !Array.isArray(tenures)) return [];

  return safeMap(tenures, (item) => {
    if (isValueLabelFormat(item)) return item;
    const itemStr = typeof item === 'string' ? item : String(item);
    return {
      value: itemStr,
      label: itemStr,
      fullLabel: itemStr,
    };
  });
};

/**
 * Normalize regions to {value, label} format.
 */
const normalizeRegions = (regions) => {
  if (Array.isArray(regions) && regions.length > 0 && isValueLabelFormat(regions[0])) {
    return regions;
  }
  return [];
};

/**
 * Normalize districts to {value, label} format.
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
 */
const normalizeBedrooms = (bedrooms) => {
  if (!bedrooms || !Array.isArray(bedrooms)) return [];

  return safeMap(bedrooms, (item) => {
    if (isValueLabelFormat(item)) return item;
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
      apiContractVersion: API_CONTRACT_VERSION,
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

    const saleTypesRaw = apiResponse[saleTypesField] || [];
    const tenuresRaw = apiResponse[tenuresField] || [];
    const regionsRaw = apiResponse[regionsField] || [];
    const districtsRaw = apiResponse[districtsField] || [];
    const bedroomsRaw = apiResponse[bedroomsField] || [];
    const marketSegmentsRaw = apiResponse[marketSegmentsField] || [];
    const propertyAgeBucketsRaw = apiResponse[propertyAgeBucketsField] || [];

    const dateRange = apiResponse[dateRangeField] || { min: null, max: null };
    const psfRange = apiResponse[psfRangeField] || { min: null, max: null };
    const sizeRange = apiResponse[sizeRangeField] || { min: null, max: null };

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
      districtsRaw: safeMap(
        Array.isArray(districtsRaw) ? districtsRaw : [],
        (d) => (isValueLabelFormat(d) ? d.value : d)
      ),
      regionsLegacy: null,
      apiContractVersion: apiResponse.apiContractVersion || API_CONTRACT_VERSION,
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
      apiContractVersion: API_CONTRACT_VERSION,
    };
  }
};
