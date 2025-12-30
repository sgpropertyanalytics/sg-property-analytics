/**
 * Hot Projects Field Helpers
 *
 * Constants and accessors for /api/projects/hot responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

const hotProjectsContract = getContract('projects/hot');
const hotProjectsFields = hotProjectsContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!hotProjectsFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing hot projects field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing hot projects field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const HotProjectsField = {
  PROJECTS: resolveField('projects'),
  TOTAL_COUNT: resolveField('total_count'),
  FILTERS_APPLIED: resolveField('filters_applied'),
  DATA_NOTE: resolveField('data_note'),
  LAST_UPDATED: resolveField('last_updated'),
};

export const getHotProjectsField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  return data[field];
};
