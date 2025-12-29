/**
 * Exit Queue Field Helpers
 *
 * Helpers for /api/projects/<project>/exit-queue responses.
 * Normalizes v1 snake_case into v2 camelCase for frontend use.
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
  PROJECT_NAME: resolveField('project_name'),
  DATA_QUALITY: resolveField('data_quality'),
  FUNDAMENTALS: resolveField('fundamentals'),
  RESALE_METRICS: resolveField('resale_metrics'),
  RISK_ASSESSMENT: resolveField('risk_assessment'),
  GATING_FLAGS: resolveField('gating_flags'),
  V2: resolveField('_v2'),
};

export const normalizeExitQueueResponse = (data) => {
  if (!data) return null;

  if (data._v2) {
    return data._v2;
  }

  const dataQuality = data.data_quality || {};
  const fundamentals = data.fundamentals || {};
  const resaleMetrics = data.resale_metrics || {};
  const riskAssessment = data.risk_assessment || {};
  const gatingFlags = data.gating_flags || {};

  return {
    projectName: data.project_name || null,
    dataQuality: {
      hasTopYear: dataQuality.has_top_year,
      hasTotalUnits: dataQuality.has_total_units,
      completeness: dataQuality.completeness,
      sampleWindowMonths: dataQuality.sample_window_months,
      warnings: dataQuality.warnings,
      unitSource: dataQuality.unit_source,
      unitConfidence: dataQuality.unit_confidence,
      unitNote: dataQuality.unit_note,
    },
    fundamentals: {
      totalUnits: fundamentals.total_units,
      topYear: fundamentals.top_year,
      propertyAgeYears: fundamentals.property_age_years,
      ageSource: fundamentals.age_source,
      tenure: fundamentals.tenure,
      district: fundamentals.district,
      developer: fundamentals.developer,
      firstResaleDate: fundamentals.first_resale_date,
    },
    resaleMetrics: {
      totalResaleTransactions: resaleMetrics.total_resale_transactions,
      resales12m: resaleMetrics.resales_12m,
      marketTurnoverPct: resaleMetrics.market_turnover_pct,
      recentTurnoverPct: resaleMetrics.recent_turnover_pct,
    },
    riskAssessment: {
      marketTurnoverZone: riskAssessment.market_turnover_zone,
      recentTurnoverZone: riskAssessment.recent_turnover_zone,
      overallRisk: riskAssessment.overall_risk,
      interpretation: riskAssessment.interpretation,
    },
    gatingFlags: {
      isBoutique: gatingFlags.is_boutique,
      isBrandNew: gatingFlags.is_brand_new,
      isUltraLuxury: gatingFlags.is_ultra_luxury,
      isThinData: gatingFlags.is_thin_data,
      unitTypeMixed: gatingFlags.unit_type_mixed,
    },
  };
};
