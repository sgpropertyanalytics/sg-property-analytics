/**
 * Transactions Table Transformation
 *
 * Light-touch adapter for /api/transactions response.
 * Normalizes pagination structure and provides stable defaults.
 */

import { isDev } from './validation';

/**
 * Transform raw transactions list response.
 *
 * This is a light-touch adapter since transactions already use getTxnField()
 * for field access. Main purpose is to normalize the response structure
 * and provide stable defaults.
 *
 * @param {Object} rawResponse - Raw response from /api/transactions
 * @returns {Object} Normalized data:
 *   {
 *     transactions: Array<Object>,
 *     totalRecords: number,
 *     totalPages: number
 *   }
 */
export const transformTransactionsList = (rawResponse) => {
  // Handle null/undefined input
  if (!rawResponse) {
    if (isDev) console.warn('[transformTransactionsList] Null input');
    return { transactions: [], totalRecords: 0, totalPages: 0 };
  }

  // Extract transactions with fallback
  const transactions = Array.isArray(rawResponse.transactions)
    ? rawResponse.transactions
    : [];

  // Extract pagination with defaults
  const pagination = rawResponse.pagination || {};
  const totalRecords = Number(pagination.total_records) || 0;
  const totalPages = Number(pagination.total_pages) || 0;

  return {
    transactions,
    totalRecords,
    totalPages,
  };
};
