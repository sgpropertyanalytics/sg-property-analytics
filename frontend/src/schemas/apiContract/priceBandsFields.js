/**
 * Price Bands Field Helpers
 *
 * Constants and accessors for /api/projects/<project>/price-bands responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

const priceBandsContract = getContract('projects/price-bands');
const priceBandsFields = priceBandsContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!priceBandsFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing price bands field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing price bands field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const PriceBandsField = {
  PROJECT_NAME: resolveField('projectName'),
  DATA_SOURCE: resolveField('dataSource'),
  PROXY_LABEL: resolveField('proxyLabel'),
  BANDS: resolveField('bands'),
  LATEST: resolveField('latest'),
  TREND: resolveField('trend'),
  VERDICT: resolveField('verdict'),
  DATA_QUALITY: resolveField('dataQuality'),
  ERROR: resolveField('error'),
  API_CONTRACT_VERSION: resolveField('apiContractVersion'),
};

const V1_PRICE_BANDS_FIELD_MAP = {
  projectName: 'project_name',
  dataSource: 'data_source',
  proxyLabel: 'proxy_label',
  dataQuality: 'data_quality',
};

export const getPriceBandsField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  const v1Field = V1_PRICE_BANDS_FIELD_MAP[field];
  if (v1Field && data[v1Field] !== undefined) {
    return data[v1Field];
  }

  return data[field];
};
