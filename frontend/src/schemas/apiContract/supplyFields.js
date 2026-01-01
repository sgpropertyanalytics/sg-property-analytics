/**
 * Supply Summary Field Helpers
 *
 * Constants and accessors for /api/supply/summary responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';
import { IS_DEV, IS_TEST } from '../../config/env';

const supplyContract = getContract('supply/summary');
const supplyFields = supplyContract?.response_schema?.data_fields || {};
const supplyMetaFields = supplyContract?.response_schema?.meta_fields || {};

const resolveDataField = (fieldName) => {
  if (!supplyFields[fieldName]) {
    if (IS_TEST) {
      throw new Error(`[API CONTRACT] Missing supply field: ${fieldName}`);
    }
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing supply field: ${fieldName}`);
    }
  }
  return fieldName;
};

const resolveMetaField = (fieldName) => {
  if (!supplyMetaFields[fieldName]) {
    if (IS_TEST) {
      throw new Error(`[API CONTRACT] Missing supply meta field: ${fieldName}`);
    }
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing supply meta field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const SupplyField = {
  BY_REGION: resolveDataField('byRegion'),
  BY_DISTRICT: resolveDataField('byDistrict'),
  TOTALS: resolveDataField('totals'),
  META: resolveDataField('meta'),
};

export const SupplyMetaField = {
  LAUNCH_YEAR: resolveMetaField('launchYear'),
  INCLUDE_GLS: resolveMetaField('includeGls'),
  COMPUTED_AS: resolveMetaField('computedAs'),
  AS_OF_DATE: resolveMetaField('asOfDate'),
  WARNINGS: resolveMetaField('warnings'),
};

export const getSupplyField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  return data[field];
};

export const getSupplyMetaField = (meta, field) => {
  if (!meta) return undefined;

  if (meta[field] !== undefined) {
    return meta[field];
  }

  return meta[field];
};
