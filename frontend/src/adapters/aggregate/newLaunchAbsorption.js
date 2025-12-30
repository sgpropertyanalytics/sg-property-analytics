/**
 * New Launch Absorption Adapter
 *
 * Transforms raw new-launch-absorption API response for chart consumption.
 *
 * API returns:
 *   { periodStart: "2024-01-01", projectCount: 5, avgAbsorption: 42.5, projectsWithUnits: 4, projectsMissing: 1 }
 *
 * Adapter outputs:
 *   { periodStart: Date, periodLabel: "Q1 2024", projectCount: 5, avgAbsorption: 42.5, ... }
 */

import { isDev } from './validation';
import { formatPeriodLabel } from './newLaunchTimeline';

/**
 * Check if period is in 2020 - uses Date object, not label string.
 *
 * @param {Date} periodDate - The period start Date object
 * @returns {boolean} True if period is in 2020
 */
export const is2020Period = (periodDate) => {
  if (!(periodDate instanceof Date) || isNaN(periodDate.getTime())) {
    return false;
  }
  return periodDate.getFullYear() === 2020;
};

/**
 * Transform new launch absorption API response.
 *
 * @param {Array} rawData - Raw data from /api/new-launch-absorption
 * @param {string} timeGrain - 'year', 'quarter', or 'month'
 * @returns {Array} Transformed and sorted data
 */
export const transformNewLaunchAbsorption = (rawData, timeGrain = 'quarter') => {
  if (!Array.isArray(rawData)) {
    if (isDev) {
      console.warn('[transformNewLaunchAbsorption] Invalid input - expected array', rawData);
    }
    return [];
  }

  return rawData
    .map((row) => {
      const periodDate = new Date(row.periodStart);

      if (isNaN(periodDate.getTime())) {
        if (isDev) {
          console.warn('[transformNewLaunchAbsorption] Invalid date:', row.periodStart);
        }
        return null;
      }

      return {
        periodStart: periodDate,
        periodLabel: formatPeriodLabel(periodDate, timeGrain),
        projectCount: row.projectCount ?? 0,
        avgAbsorption: row.avgAbsorption, // Can be null
        projectsWithUnits: row.projectsWithUnits ?? 0,
        projectsMissing: row.projectsMissing ?? 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.periodStart - b.periodStart);
};
