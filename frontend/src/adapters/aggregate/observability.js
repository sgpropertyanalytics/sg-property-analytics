/**
 * Observability Helpers
 *
 * Debug logging utilities for data fetching and transformation.
 * Only active in development mode.
 */

import { isDev } from './validation';

/**
 * Log debug information about a data fetch.
 * Only logs in development mode.
 *
 * @param {string} chartName - Name of the chart
 * @param {Object} options - Debug options
 * @param {string} options.endpoint - API endpoint
 * @param {string} options.timeGrain - Time grain used
 * @param {Object} options.response - API response
 * @param {number} options.rowCount - Number of rows returned
 */
export const logFetchDebug = (chartName, { endpoint, timeGrain, response, rowCount }) => {
  if (!isDev) return;

  /* eslint-disable no-console */
  console.group(`[${chartName}] Data Fetch`);
  console.log('Endpoint:', endpoint);
  console.log('Time Grain:', timeGrain);
  if (response?.meta) {
    console.log('API Contract Version:', response.meta.apiContractVersion || 'v1');
  }
  console.log('Row Count:', rowCount);
  if (rowCount > 0 && response?.data?.[0]) {
    console.log('First Row Keys:', Object.keys(response.data[0]));
  }
  console.groupEnd();
  /* eslint-enable no-console */
};

/**
 * Log transform error with context.
 *
 * @param {string} chartName - Name of the chart
 * @param {string} step - Transform step that failed
 * @param {Error} error - The error
 * @param {Object} context - Additional context
 */
export const logTransformError = (chartName, step, error, context = {}) => {
  console.error(`[${chartName}] Transform failed at: ${step}`, {
    error: error.message,
    ...context,
  });
};
