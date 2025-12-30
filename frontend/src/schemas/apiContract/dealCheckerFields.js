/**
 * Deal Checker Field Helpers
 *
 * Constants and accessors for /api/deal-checker endpoints.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

const dealCheckerContract = getContract('deal-checker/multi-scope');
const dealCheckerFields = dealCheckerContract?.response_schema?.data_fields || {};

const projectNamesContract = getContract('deal-checker/project-names');
const projectNamesFields = projectNamesContract?.response_schema?.data_fields || {};

const resolveField = (fields, fieldName, label) => {
  if (!fields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing ${label} field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing ${label} field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const DealCheckerField = {
  PROJECT: resolveField(dealCheckerFields, 'project', 'deal checker'),
  FILTERS: resolveField(dealCheckerFields, 'filters', 'deal checker'),
  SCOPES: resolveField(dealCheckerFields, 'scopes', 'deal checker'),
  MAP_DATA: resolveField(dealCheckerFields, 'map_data', 'deal checker'),
  META: resolveField(dealCheckerFields, 'meta', 'deal checker'),
};

export const ProjectNamesField = {
  PROJECTS: resolveField(projectNamesFields, 'projects', 'project names'),
  COUNT: resolveField(projectNamesFields, 'count', 'project names'),
};

export const getDealCheckerField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  return data[field];
};

export const getProjectNamesField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  return data[field];
};
