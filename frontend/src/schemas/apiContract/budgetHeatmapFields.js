/**
 * Budget Heatmap Field Helpers
 *
 * Constants and accessors for /api/budget-heatmap responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

const budgetHeatmapContract = getContract('charts/budget-heatmap');
const budgetHeatmapFields = budgetHeatmapContract?.response_schema?.data_fields || {};
const budgetHeatmapMetaFields = budgetHeatmapContract?.response_schema?.meta_fields || {};

const resolveDataField = (fieldName) => {
  if (!budgetHeatmapFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing budget heatmap field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing budget heatmap field: ${fieldName}`);
    }
  }
  return fieldName;
};

const resolveMetaField = (fieldName) => {
  if (!budgetHeatmapMetaFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing budget heatmap meta field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing budget heatmap meta field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const BudgetHeatmapField = {
  MATRIX: resolveDataField('matrix'),
  AGE_BANDS: resolveDataField('ageBands'),
  BEDROOM_TYPES: resolveDataField('bedroomTypes'),
  TOTAL_COUNT: resolveDataField('totalCount'),
  INSIGHT: resolveDataField('insight'),
  META: resolveDataField('meta'),
};

export const BudgetHeatmapRowField = {
  ROW_TOTAL: 'rowTotal',
  LOW_SAMPLE: 'lowSample',
};

export const BudgetHeatmapMetaField = {
  BUDGET: resolveMetaField('budget'),
  TOLERANCE: resolveMetaField('tolerance'),
  PRICE_RANGE: resolveMetaField('priceRange'),
  MONTHS_LOOKBACK: resolveMetaField('monthsLookback'),
  AGE_IS_APPROX: resolveMetaField('ageIsApprox'),
};

export const getBudgetHeatmapField = (data, field) => {
  if (!data) return undefined;
  return data[field];
};

export const getBudgetHeatmapRowField = (row, field) => {
  if (!row) return undefined;
  return row[field];
};

export const getBudgetHeatmapMetaField = (meta, field) => {
  if (!meta) return undefined;
  return meta[field];
};
