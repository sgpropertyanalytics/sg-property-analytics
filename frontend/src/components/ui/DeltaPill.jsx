import React from 'react';

/**
 * DeltaPill - Luxury semantic badge for percentage changes
 *
 * Design System: High-End Fintech / Luxury Asset Management
 * - Positive: Desaturated emerald (bg-emerald-50, text-emerald-700)
 * - Negative: Desaturated rose (bg-rose-50, text-rose-700)
 * - Neutral: Slate for no change
 *
 * @param {number} value - The percentage value (e.g., 11.7 or -5.2)
 * @param {string} [className] - Additional classes
 * @param {boolean} [showSign=true] - Whether to show +/- sign
 * @param {string} [suffix='%'] - Suffix after number
 */
export function DeltaPill({
  value,
  className = '',
  showSign = true,
  suffix = '%',
}) {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  const isPositive = numValue > 0;
  const isNegative = numValue < 0;
  const isNeutral = numValue === 0 || isNaN(numValue);

  // Determine pill styling
  let pillClass = 'delta-pill ';
  if (isPositive) {
    pillClass += 'delta-pill-positive';
  } else if (isNegative) {
    pillClass += 'delta-pill-negative';
  } else {
    pillClass += 'delta-pill-neutral';
  }

  // Format the display value
  const displayValue = isNaN(numValue)
    ? '—'
    : `${showSign && isPositive ? '+' : ''}${numValue.toFixed(1)}${suffix}`;

  return (
    <span className={`${pillClass} ${className}`}>
      {displayValue}
    </span>
  );
}

/**
 * DeltaText - Inline colored text (no pill background)
 * For use in tables or dense data displays
 */
export function DeltaText({
  value,
  className = '',
  showSign = true,
  suffix = '%',
}) {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  const isPositive = numValue > 0;
  const isNegative = numValue < 0;

  let textClass = 'font-mono text-sm font-medium tabular-nums ';
  if (isPositive) {
    textClass += 'text-emerald-600';
  } else if (isNegative) {
    textClass += 'text-rose-600';
  } else {
    textClass += 'text-slate-500';
  }

  const displayValue = isNaN(numValue)
    ? '—'
    : `${showSign && isPositive ? '+' : ''}${numValue.toFixed(1)}${suffix}`;

  return (
    <span className={`${textClass} ${className}`}>
      {displayValue}
    </span>
  );
}

export default DeltaPill;
