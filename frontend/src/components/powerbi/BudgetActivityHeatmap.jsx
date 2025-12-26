import React, { useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { getBudgetHeatmap } from '../../api/client';
import { getBedroomLabelShort, formatPrice } from '../../constants';

/**
 * Color scale for heatmap intensity based on percentage
 * 0% = light gray, higher % = darker (sand → ocean blue → deep navy)
 */
const getHeatColor = (pct) => {
  if (pct === null || pct === undefined) return '#F8F9FA'; // Suppressed/empty
  if (pct === 0) return '#F8F9FA';

  // Gradient: #EAE0CF (sand) → #547792 (ocean blue) → #213448 (deep navy)
  // Map pct (0-100) to intensity (0-1)
  const intensity = Math.min(pct / 60, 1); // 60%+ gets max color

  if (intensity < 0.5) {
    // Blend sand → ocean blue
    return interpolateColor('#EAE0CF', '#547792', intensity * 2);
  } else {
    // Blend ocean blue → deep navy
    return interpolateColor('#547792', '#213448', (intensity - 0.5) * 2);
  }
};

/**
 * Linear interpolation between two hex colors
 */
const interpolateColor = (color1, color2, factor) => {
  const hex = (c) => parseInt(c.slice(1), 16);
  const r1 = (hex(color1) >> 16) & 255;
  const g1 = (hex(color1) >> 8) & 255;
  const b1 = hex(color1) & 255;
  const r2 = (hex(color2) >> 16) & 255;
  const g2 = (hex(color2) >> 8) & 255;
  const b2 = hex(color2) & 255;

  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));

  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Get text color based on background brightness
 */
const getTextColor = (pct) => {
  if (pct === null || pct === undefined || pct === 0) return '#547792';
  if (pct > 35) return '#FFFFFF';
  return '#213448';
};

/**
 * BudgetActivityHeatmap - Bedroom Mix by Property Age
 *
 * Shows % distribution of transactions within budget range.
 * Each row answers: "For this property age, what bedroom sizes do buyers choose?"
 *
 * Features:
 * - Row percentages (each row sums to 100%)
 * - K-anonymity: low_sample rows, suppressed cells
 * - Color intensity based on percentage
 * - Striped pattern for low-sample rows
 */
export function BudgetActivityHeatmap({
  budget,
  bedroom = null,
  region = null,
  district = null,
  tenure = null,
}) {
  // Build API params
  const apiParams = useMemo(() => ({
    budget,
    tolerance: 100000,
    bedroom: bedroom || undefined,
    segment: region || undefined,
    district: district || undefined,
    tenure: tenure || undefined,
  }), [budget, bedroom, region, district, tenure]);

  // Fetch data with abort handling
  const { data, loading, error } = useAbortableQuery(
    async (signal) => {
      const response = await getBudgetHeatmap(apiParams, { signal });
      return response.data;
    },
    [JSON.stringify(apiParams)],
    {
      enabled: budget >= 500000,
      initialData: null,
    }
  );

  // Age bands and bedroom types from response
  const ageBands = data?.age_bands || [];
  const bedroomTypes = data?.bedroom_types || [1, 2, 3, 4, 5];

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-[#EAE0CF]/50 rounded w-2/3" />
          <div className="h-3 bg-[#EAE0CF]/30 rounded w-1/3" />
          <div className="h-40 bg-[#EAE0CF]/30 rounded mt-4" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-6">
        <p className="text-sm text-red-600">Failed to load market activity data</p>
      </div>
    );
  }

  // No data or empty state
  if (!data || data.total_count === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-6">
        <h4 className="font-semibold text-[#213448] mb-2">
          Bedroom Mix by Property Age
        </h4>
        <p className="text-sm text-[#547792]">
          No transactions found within this budget range. Try adjusting your budget or filters.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <h4 className="font-semibold text-[#213448]">
          Bedroom Mix by Property Age
        </h4>
        <p className="text-xs text-[#547792] mt-0.5">
          Share of transactions in each age group (within your budget)
        </p>
      </div>

      {/* Heatmap Table */}
      <div className="p-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left px-2 py-2 text-xs font-medium text-[#547792] w-44">
                Property Type
              </th>
              {bedroomTypes.map((br) => (
                <th
                  key={br}
                  className="text-center px-2 py-2 text-xs font-medium text-[#547792] min-w-[52px]"
                >
                  {getBedroomLabelShort(br)}
                </th>
              ))}
              <th className="text-center px-2 py-2 text-xs font-medium text-[#547792] min-w-[60px]">
                Count
              </th>
            </tr>
          </thead>
          <tbody>
            {ageBands.map((band) => {
              const rowData = data.matrix[band.key] || {};
              const rowTotal = rowData.row_total || 0;
              const isLowSample = rowData.low_sample;

              return (
                <tr
                  key={band.key}
                  className={`border-t border-[#94B4C1]/20 ${
                    isLowSample ? 'bg-stripes' : ''
                  }`}
                >
                  {/* Age band label */}
                  <td className="px-2 py-2 text-xs font-medium text-[#213448]">
                    <div className="flex items-center gap-2">
                      <span>{band.label}</span>
                      {isLowSample && (
                        <span className="text-[10px] text-[#94B4C1] bg-[#94B4C1]/10 px-1.5 py-0.5 rounded">
                          Limited sample
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Bedroom cells */}
                  {bedroomTypes.map((br) => {
                    const cellData = rowData[String(br)] || {};
                    const pct = cellData.pct;
                    const count = cellData.count;
                    const isSuppressed = cellData.suppressed;

                    const bgColor = isSuppressed || isLowSample
                      ? '#F8F9FA'
                      : getHeatColor(pct);
                    const textColor = isSuppressed || isLowSample
                      ? '#94B4C1'
                      : getTextColor(pct);

                    // Tooltip content
                    const tooltipText = isSuppressed
                      ? 'Suppressed (<5 transactions)'
                      : isLowSample
                        ? 'Limited sample size'
                        : `${count} transaction${count !== 1 ? 's' : ''}`;

                    return (
                      <td
                        key={br}
                        className="text-center px-2 py-2 text-xs font-mono transition-colors"
                        style={{ backgroundColor: bgColor, color: textColor }}
                        title={tooltipText}
                      >
                        {isSuppressed || isLowSample ? (
                          <span className="text-[#94B4C1]">—</span>
                        ) : pct === 0 ? (
                          <span className="text-[#94B4C1]">—</span>
                        ) : (
                          `${Math.round(pct)}%`
                        )}
                      </td>
                    );
                  })}

                  {/* Row total */}
                  <td className="text-center px-2 py-2 text-xs font-mono text-[#547792] bg-[#EAE0CF]/20">
                    {isLowSample ? (
                      <span className="text-[#94B4C1]">{rowTotal}</span>
                    ) : (
                      rowTotal
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Insight Text */}
      {data.insight && (
        <div className="px-4 py-3 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-[#547792] mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-xs text-[#547792]">{data.insight}</p>
          </div>
        </div>
      )}

      {/* Footer: Disclaimer + Legend */}
      <div className="px-4 py-2 bg-[#547792]/5 border-t border-[#94B4C1]/20">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#94B4C1]">
          {/* Disclaimer */}
          <span>This reflects where buyers transact — not current listings.</span>

          {/* Legend */}
          <div className="flex items-center gap-2">
            <span>Distribution:</span>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-3 rounded border border-[#94B4C1]/30"
                style={{ backgroundColor: '#F8F9FA' }}
              />
              <span>Low</span>
            </div>
            <div
              className="w-12 h-3 rounded"
              style={{
                background: 'linear-gradient(to right, #EAE0CF, #547792, #213448)',
              }}
            />
            <span>High</span>
          </div>
        </div>
      </div>

      {/* CSS for striped pattern on low-sample rows */}
      <style>{`
        .bg-stripes {
          background-image: repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 4px,
            rgba(148, 180, 193, 0.08) 4px,
            rgba(148, 180, 193, 0.08) 8px
          );
        }
      `}</style>
    </div>
  );
}

export default BudgetActivityHeatmap;
