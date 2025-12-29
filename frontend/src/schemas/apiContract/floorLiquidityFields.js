/**
 * Floor Liquidity Heatmap Field Helpers
 *
 * Constants and accessors for /api/floor-liquidity-heatmap responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

const floorLiquidityContract = getContract('charts/floor-liquidity-heatmap');
const floorLiquidityFields = floorLiquidityContract?.response_schema?.data_fields || {};
const floorLiquidityMetaFields = floorLiquidityContract?.response_schema?.meta_fields || {};

const resolveDataField = (fieldName) => {
  if (!floorLiquidityFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing floor liquidity field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing floor liquidity field: ${fieldName}`);
    }
  }
  return fieldName;
};

const resolveMetaField = (fieldName) => {
  if (!floorLiquidityMetaFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing floor liquidity meta field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing floor liquidity meta field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const FloorLiquidityField = {
  PROJECTS: resolveDataField('projects'),
  FLOOR_ZONE_ORDER: resolveDataField('floor_zone_order'),
};

export const FloorLiquidityMetaField = {
  WINDOW_MONTHS: resolveMetaField('window_months'),
  FILTERS_APPLIED: resolveMetaField('filters_applied'),
  TOTAL_PROJECTS: resolveMetaField('total_projects'),
  PROJECTS_RETURNED: resolveMetaField('projects_returned'),
  EXCLUSIONS: resolveMetaField('exclusions'),
  CACHE_HIT: resolveMetaField('cache_hit'),
  ELAPSED_MS: resolveMetaField('elapsed_ms'),
};

const V1_FLOOR_LIQUIDITY_META_FIELD_MAP = {
  filtersApplied: 'filters_applied',
  cacheHit: 'cache_hit',
};

export const getFloorLiquidityField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  return data[field];
};

export const getFloorLiquidityMetaField = (meta, field) => {
  if (!meta) return undefined;

  if (meta[field] !== undefined) {
    return meta[field];
  }

  const v1Field = V1_FLOOR_LIQUIDITY_META_FIELD_MAP[field];
  if (v1Field && meta[v1Field] !== undefined) {
    return meta[v1Field];
  }

  return meta[field];
};
