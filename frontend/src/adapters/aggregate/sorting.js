/**
 * Period Sorting Utilities
 *
 * Handles sorting of time-series data by period.
 * Supports year, quarter (YYYY-QN), and month (YYYY-MM) formats.
 */

import { getPeriod } from '../../schemas/apiContract';

/**
 * Compare two period values for sorting.
 * Handles year (number), quarter (YYYY-QN), and month (YYYY-MM) formats.
 *
 * @param {string|number} a - First period
 * @param {string|number} b - Second period
 * @returns {number} Comparison result (-1, 0, 1)
 */
export const comparePeriods = (a, b) => {
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;

  // Handle numeric years
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  // Convert to strings for comparison
  const strA = String(a);
  const strB = String(b);

  // Quarter format: "2024-Q4" → compare year first, then quarter
  const quarterMatch = /^(\d{4})-Q(\d)$/;
  const matchA = strA.match(quarterMatch);
  const matchB = strB.match(quarterMatch);

  if (matchA && matchB) {
    const yearDiff = parseInt(matchA[1]) - parseInt(matchB[1]);
    if (yearDiff !== 0) return yearDiff;
    return parseInt(matchA[2]) - parseInt(matchB[2]);
  }

  // Month format: "2024-12" → natural string comparison works
  // Year format: "2024" → natural string comparison works
  return strA.localeCompare(strB);
};

/**
 * Sort data array by period in ascending order.
 *
 * @param {Array} data - Array of objects with period field
 * @returns {Array} Sorted array (new array, does not mutate input)
 */
export const sortByPeriod = (data) => {
  if (!Array.isArray(data)) return [];

  return [...data].sort((a, b) => {
    const periodA = getPeriod(a);
    const periodB = getPeriod(b);
    return comparePeriods(periodA, periodB);
  });
};
