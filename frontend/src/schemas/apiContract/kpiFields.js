/**
 * KPI Field Helpers
 *
 * Constants and accessors for KPI summary API responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';
import { IS_DEV, IS_TEST } from '../../config/env';

const kpiContract = getContract('kpi-summary-v2');
const kpiFields = kpiContract?.response_schema?.data_fields || {};

const hasContractFields = Object.keys(kpiFields).some((field) => field !== 'kpis');

const resolveField = (fieldName) => {
  if (!hasContractFields) {
    return fieldName;
  }
  if (!kpiFields[fieldName]) {
    if (IS_TEST) {
      throw new Error(`[API CONTRACT] Missing KPI field: ${fieldName}`);
    }
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing KPI field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const KpiField = {
  KPI_ID: resolveField('kpi_id'),
  TITLE: resolveField('title'),
  VALUE: resolveField('value'),
  FORMATTED_VALUE: resolveField('formatted_value'),
  SUBTITLE: resolveField('subtitle'),
  TREND: resolveField('trend'),
  INSIGHT: resolveField('insight'),
  META: resolveField('meta'),
};

/**
 * Get field value from KPI object using canonical field constants.
 */
export const getKpiField = (kpi, field) => {
  if (!kpi) return undefined;
  return kpi[field];
};
