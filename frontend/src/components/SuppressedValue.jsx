import React from 'react';

/**
 * SuppressedValue - Display component for K-anonymity suppressed data
 *
 * MANDATORY: Use this for any value that may be suppressed due to
 * insufficient sample size (K-anonymity protection).
 *
 * When suppressed=true:
 * - Shows "—" instead of actual value
 * - Displays tooltip explaining why
 * - Optionally greys out the cell
 *
 * Usage:
 *   <SuppressedValue
 *     value={row.medianPrice}
 *     suppressed={row.suppressed}
 *     kRequired={row.kRequired}
 *     formatter={formatCurrency}
 *   />
 */
export function SuppressedValue({
  value,
  suppressed = false,
  kRequired = 15,
  observationCount: _observationCount,
  formatter = (v) => v,
  className = '',
  showTooltip = true,
}) {
  if (suppressed || value === null || value === undefined) {
    return (
      <span
        className={`text-[#94B4C1] ${className}`}
        title={showTooltip ? `Hidden due to insufficient sample size (minimum ${kRequired} observations required)` : undefined}
      >
        —
      </span>
    );
  }

  return (
    <span className={className}>
      {formatter(value)}
    </span>
  );
}

/**
 * SuppressedRow - Wrapper for table rows with suppressed data
 *
 * Applies visual styling to indicate suppressed rows:
 * - Greyed out background
 * - Reduced opacity
 * - Disabled hover interactions
 */
export function SuppressedRow({ suppressed, children, className = '' }) {
  const baseClass = suppressed
    ? 'opacity-60 bg-[#EAE0CF]/20 pointer-events-none'
    : '';

  return (
    <tr className={`${baseClass} ${className}`}>
      {children}
    </tr>
  );
}

/**
 * ObservationCount - Display observation count with appropriate styling
 *
 * Shows the count with visual indication if below threshold.
 */
export function ObservationCount({
  count,
  kRequired = 15,
  className = '',
}) {
  const isBelowThreshold = count < kRequired;

  return (
    <span
      className={`${isBelowThreshold ? 'text-amber-600' : 'text-[#547792]'} ${className}`}
      title={isBelowThreshold ? `Below minimum threshold of ${kRequired}` : `${count} observations`}
    >
      {count?.toLocaleString() || '—'}
    </span>
  );
}

/**
 * Compliance-safe column labels
 *
 * Use these instead of raw labels to maintain URA-compliant terminology.
 */
export const COMPLIANT_LABELS = {
  // Old → New
  transactions: 'Observations',
  transaction: 'Observation',
  medianPrice: 'Median (Aggregated)',
  exactPsf: 'PSF Range',
  sales: 'Market Activity',
  sold: 'Recorded',
  transactionDate: 'Period',
  price: 'Price Range',
};

/**
 * Get compliant label for a column
 */
export function getCompliantLabel(key) {
  return COMPLIANT_LABELS[key] || key;
}

export default SuppressedValue;
