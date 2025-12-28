import React from 'react';
import { formatPriceShort, formatPsf, getBudgetZoneStyle } from '../../adapters/aggregate';

/**
 * PriceCorridorCell - Single cell showing price corridor with 3 zones
 *
 * Visual representation:
 * ```
 *                    ▼ Your Budget
 *   ░░░░░|██████████████|▓▓▓
 *   $1.2M    $1.4M-$1.6M   $1.8M
 *   Bargain    Fair Zone   Premium
 *
 *   PSF: $1,850 - $2,100/sqft
 *   Based on 42 transactions
 * ```
 *
 * @param {Object} props
 * @param {Object} props.cellData - Data from priceRangeAdapter
 * @param {number} props.budget - User's target budget (for marker position)
 * @param {boolean} props.compact - Compact mode (less details)
 */
export function PriceCorridorCell({ cellData, budget, compact = false }) {
  // Empty/suppressed cell
  if (!cellData) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        -
      </div>
    );
  }

  if (cellData.suppressed) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        <span title="Insufficient data (K-anonymity protection)">-</span>
      </div>
    );
  }

  const {
    priceQ1,
    priceMedian,
    priceQ3,
    priceMin,
    priceMax,
    psfQ1,
    psfQ3,
    count,
    budgetZone,
  } = cellData;

  // Calculate budget marker position (0-100%)
  let budgetPosition = null;
  if (budget && priceMin && priceMax && priceMax > priceMin) {
    const range = priceMax - priceMin;
    const position = ((budget - priceMin) / range) * 100;
    budgetPosition = Math.max(0, Math.min(100, position));
  }

  // Calculate zone boundaries (as percentages of bar)
  const q1Pct = priceMin && priceMax && priceMax > priceMin
    ? ((priceQ1 - priceMin) / (priceMax - priceMin)) * 100
    : 25;
  const q3Pct = priceMin && priceMax && priceMax > priceMin
    ? ((priceQ3 - priceMin) / (priceMax - priceMin)) * 100
    : 75;

  const zoneStyle = budgetZone ? getBudgetZoneStyle(budgetZone) : null;

  return (
    <div className="p-2 h-full flex flex-col justify-between">
      {/* Budget marker (if within range) */}
      {budgetPosition !== null && (
        <div className="relative h-4 mb-1">
          <div
            className="absolute transform -translate-x-1/2 text-xs whitespace-nowrap"
            style={{ left: `${budgetPosition}%` }}
          >
            <span className="text-[#213448]">▼</span>
            {!compact && zoneStyle && (
              <span
                className="ml-1 px-1 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: zoneStyle.bgColor, color: zoneStyle.color }}
              >
                {zoneStyle.label}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Price corridor bar */}
      <div className="relative h-3 rounded-full overflow-hidden bg-gray-100 mb-2">
        {/* Bargain zone (left) */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-[#94B4C1]"
          style={{ width: `${q1Pct}%` }}
        />
        {/* Fair zone (middle) */}
        <div
          className="absolute top-0 bottom-0 bg-[#213448]"
          style={{ left: `${q1Pct}%`, width: `${q3Pct - q1Pct}%` }}
        />
        {/* Premium zone (right) */}
        <div
          className="absolute top-0 bottom-0 right-0 bg-[#EAE0CF]"
          style={{ left: `${q3Pct}%` }}
        />

        {/* Budget marker line */}
        {budgetPosition !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500"
            style={{ left: `${budgetPosition}%` }}
          />
        )}
      </div>

      {/* Price labels */}
      <div className="flex justify-between text-[10px] text-gray-600 mb-1">
        <span>{formatPriceShort(priceMin)}</span>
        <span className="font-medium text-[#213448]">
          {formatPriceShort(priceQ1)} - {formatPriceShort(priceQ3)}
        </span>
        <span>{formatPriceShort(priceMax)}</span>
      </div>

      {/* PSF range (if not compact) */}
      {!compact && psfQ1 && psfQ3 && (
        <div className="text-[10px] text-gray-500 text-center">
          PSF: {formatPsf(psfQ1)} - {formatPsf(psfQ3)}
        </div>
      )}

      {/* Sample size */}
      <div className="text-[9px] text-gray-400 text-center mt-1">
        {count} transaction{count !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

/**
 * PriceCorridorLegend - Legend explaining the 3 zones
 */
export function PriceCorridorLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-600">
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded bg-[#94B4C1]" />
        <span>Bargain (&lt;Q1)</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded bg-[#213448]" />
        <span>Fair (Q1-Q3)</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded bg-[#EAE0CF] border border-gray-300" />
        <span>Premium (&gt;Q3)</span>
      </div>
    </div>
  );
}

export default PriceCorridorCell;
