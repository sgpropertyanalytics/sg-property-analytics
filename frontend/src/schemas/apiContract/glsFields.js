/**
 * GLS Field Helpers
 *
 * Constants and accessors for /api/gls/all responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

const glsAllContract = getContract('gls/all');
const glsAllFields = glsAllContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!glsAllFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing GLS field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing GLS field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const GlsAllField = {
  COUNT: resolveField('count'),
  SUMMARY: resolveField('summary'),
  DATA: resolveField('data'),
};

export const getGlsAllField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  return data[field];
};
