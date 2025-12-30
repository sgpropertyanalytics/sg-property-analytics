/**
 * New vs Resale Field Helpers
 *
 * Constants and accessors for /api/new-vs-resale responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

const newVsResaleContract = getContract('trends/new-vs-resale');
const newVsResaleFields = newVsResaleContract?.response_schema?.data_fields || {};

const resolveDataField = (fieldName) => {
  if (!newVsResaleFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing new vs resale field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing new vs resale field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const NewVsResaleField = {
  CHART_DATA: resolveDataField('chartData'),
  SUMMARY: resolveDataField('summary'),
  APPLIED_FILTERS: resolveDataField('appliedFilters'),
};

export const getNewVsResaleField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  return data[field];
};
