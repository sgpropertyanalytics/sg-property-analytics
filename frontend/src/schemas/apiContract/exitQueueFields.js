/**
 * Exit Queue Field Helpers
 *
 * Helpers for /api/projects/<project>/exit-queue responses (v2-only).
 */

import { getContract } from '../../generated/apiContract';

const exitQueueContract = getContract('projects/exit-queue');
const exitQueueFields = exitQueueContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!exitQueueFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing exit queue field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing exit queue field: ${fieldName}`);
    }
  }
  return fieldName;
};

export const ExitQueueField = {
  PROJECT_NAME: resolveField('projectName'),
  DATA_QUALITY: resolveField('dataQuality'),
  FUNDAMENTALS: resolveField('fundamentals'),
  RESALE_METRICS: resolveField('resaleMetrics'),
  RISK_ASSESSMENT: resolveField('riskAssessment'),
  GATING_FLAGS: resolveField('gatingFlags'),
};

export const normalizeExitQueueResponse = (data) => {
  return data || null;
};
