/**
 * Price Bands Field Helpers
 *
 * Constants and accessors for /api/projects/<project>/price-bands responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';
import { IS_DEV, IS_TEST } from '../../config/env';

const priceBandsContract = getContract('projects/price-bands');
const priceBandsFields = priceBandsContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!priceBandsFields[fieldName]) {
    if (IS_TEST) {
      throw new Error(`[API CONTRACT] Missing price bands field: ${fieldName}`);
    }
    if (IS_DEV) {
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

export const getPriceBandsField = (data, field) => {
  if (!data) return undefined;
  return data[field];
};
