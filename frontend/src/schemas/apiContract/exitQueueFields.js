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
  if (!data) return null;

  // The 404 "no_resales" error response uses snake_case keys (data_quality)
  // while the success response uses camelCase (dataQuality) from serialize_exit_queue_v2.
  // Normalize both shapes into a consistent camelCase structure with safe defaults.
  return {
    projectName: data.projectName || data.project_name || null,
    dataQuality: {
      hasTopYear: false,
      hasTotalUnits: false,
      completeness: 'no_resales',
      sampleWindowMonths: 0,
      unitSource: null,
      unitConfidence: null,
      unitNote: null,
      // Overlay with actual data (success response = camelCase, 404 = snake_case)
      ...(data.dataQuality || data.data_quality || {}),
      // Ensure warnings is always an array (never null)
      warnings: (data.dataQuality || data.data_quality || {}).warnings || [],
    },
    fundamentals: data.fundamentals || null,
    resaleMetrics: data.resaleMetrics || data.resale_metrics || null,
    riskAssessment: data.riskAssessment || data.risk_assessment || null,
    gatingFlags: data.gatingFlags || data.gating_flags || null,
  };
};
