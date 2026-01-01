/**
 * New Launch Timeline Adapter
 *
 * Transforms raw new-launch-timeline API response for chart consumption.
 *
 * API returns:
 *   { periodStart: "2024-01-01", projectCount: 5, totalUnits: 1200 }
 *
 * Adapter outputs:
 *   { periodStart: Date, periodLabel: "Q1 2024", projectCount: 5, totalUnits: 1200, avgUnitsPerProject: 240 }
 */

import { isDev } from './validation';

/**
 * Format a period label based on time grain.
 *
 * @param {Date} date - The period start date
 * @param {string} timeGrain - 'year', 'quarter', or 'month'
 * @returns {string} Formatted label (e.g., "Q1 2024", "Jan 2024", "2024")
 */
export const formatPeriodLabel = (date, timeGrain) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = date.getMonth();

  switch (timeGrain) {
    case 'year':
      return `${year}`;
    case 'quarter': {
      const quarter = Math.floor(month / 3) + 1;
      return `Q${quarter} ${year}`;
    }
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    default: {
      // Default to quarter format
      const q = Math.floor(month / 3) + 1;
      return `Q${q} ${year}`;
    }
  }
};

/**
 * Transform new launch timeline API response.
 *
 * @param {Array} rawData - Raw data from /api/new-launch-timeline
 * @param {string} timeGrain - 'year', 'quarter', or 'month'
 * @returns {Array} Transformed and sorted data with structure:
 *   { periodStart: Date, periodLabel: string, projectCount: number, totalUnits: number, avgUnitsPerProject: number }
 */
export const transformNewLaunchTimeline = (rawData, timeGrain = 'quarter') => {
  if (!Array.isArray(rawData)) {
    if (isDev) {
      console.warn('[transformNewLaunchTimeline] Invalid input - expected array', rawData);
    }
    return [];
  }

  return rawData
    .map((row) => {
      // Parse ISO date string to Date object
      const periodDate = new Date(row.periodStart);

      // Validate date
      if (isNaN(periodDate.getTime())) {
        if (isDev) {
          console.warn('[transformNewLaunchTimeline] Invalid date:', row.periodStart);
        }
        return null;
      }

      const projectCount = row.projectCount ?? 0;
      const totalUnits = row.totalUnits ?? 0;
      const avgUnitsPerProject = projectCount > 0 ? Math.round(totalUnits / projectCount) : 0;

      return {
        periodStart: periodDate,
        periodLabel: formatPeriodLabel(periodDate, timeGrain),
        projectCount,
        totalUnits,
        avgUnitsPerProject,
      };
    })
    .filter(Boolean) // Remove null entries from invalid dates
    .sort((a, b) => a.periodStart - b.periodStart); // Sort by Date, not string
};
