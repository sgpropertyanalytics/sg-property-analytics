/**
 * Project Inventory Field Helpers
 *
 * Constants and accessors for /api/projects/<project>/inventory responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

const projectInventoryContract = getContract('projects/inventory');
const projectInventoryFields = projectInventoryContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!projectInventoryFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing project inventory field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing project inventory field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const ProjectInventoryField = {
  PROJECT_NAME: resolveField('project_name'),
  CUMULATIVE_NEW_SALES: resolveField('cumulative_new_sales'),
  CUMULATIVE_RESALES: resolveField('cumulative_resales'),
  TOTAL_TRANSACTIONS: resolveField('total_transactions'),
  TOTAL_UNITS: resolveField('total_units'),
  ESTIMATED_UNSOLD: resolveField('estimated_unsold'),
  PERCENT_SOLD: resolveField('percent_sold'),
  DATA_SOURCE: resolveField('data_source'),
  MESSAGE: resolveField('message'),
};

export const getProjectInventoryField = (data, field) => {
  if (!data) return undefined;

  if (data[field] !== undefined) {
    return data[field];
  }

  return data[field];
};
