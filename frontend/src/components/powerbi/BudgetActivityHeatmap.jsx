import React, { useMemo, useState } from 'react';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery } from '../../hooks';
import { getBudgetHeatmap } from '../../api/client';
import { getBedroomLabelShort } from '../../constants';
import { assertKnownVersion } from '../../adapters';
import {
  BudgetHeatmapField,
  BudgetHeatmapRowField,
  getBudgetHeatmapField,
  getBudgetHeatmapRowField,
} from '../../schemas/apiContract';
import { ChartFrame } from '../common/ChartFrame';
import { INK, REGION, CANVAS } from '../../constants/colors';

// Time window presets: label → months
const TIME_PRESETS = {
  '3M': 3,
  '12M': 12,
  '2Y': 24,
  '5Y': 60,
};

// Heatmap color constants (from design system)
const HEAT_EMPTY = '#F8F9FA';

/**
 * Color scale for heatmap intensity based on percentage
 * 0% = light gray, higher % = darker (slate-200 → slate-700 → slate-900)
 */
const getHeatColor = (pct) => {
  if (pct === null || pct === undefined) return HEAT_EMPTY;
  if (pct === 0) return HEAT_EMPTY;

  // Gradient: CANVAS.grid (slate-200) → REGION.RCR (slate-700) → REGION.CCR (slate-900)
  // Map pct (0-100) to intensity (0-1)
  const intensity = Math.min(pct / 60, 1); // 60%+ gets max color

  if (intensity < 0.5) {
    // Blend slate-200 → slate-700
    return interpolateColor(CANVAS.grid, REGION.RCR, intensity * 2);
  } else {
    // Blend slate-700 → slate-900
    return interpolateColor(REGION.RCR, REGION.CCR, (intensity - 0.5) * 2);
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
  if (pct === null || pct === undefined || pct === 0) return INK.mid; // slate-600
  if (pct > 35) return '#FFFFFF';
  return INK.primary; // slate-900
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
  // Time window state (default 3M)
  const [timePreset, setTimePreset] = useState('3M');
  const timeWindow = TIME_PRESETS[timePreset];

  // Build API params
  const apiParams = useMemo(() => ({
    budget,
    tolerance: 100000,
    bedroom: bedroom || undefined,
    segment: region || undefined,
    district: district || undefined,
    tenure: tenure || undefined,
    months_lookback: timeWindow,
  }), [budget, bedroom, region, district, tenure, timeWindow]);

  // Fetch data with abort handling - gates on appReady
  // TanStack Query handles structural comparison of query keys
  const { data, status, error, refetch, isFetching } = useAppQuery(
    async (signal) => {
      const response = await getBudgetHeatmap(apiParams, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/budget-heatmap');

      return response.data;
    },
    ['budgetHeatmap', apiParams],
    {
      chartName: 'BudgetActivityHeatmap',
      enabled: budget >= 500000,
      initialData: null,
      keepPreviousData: true,
    }
  );

  // Age bands and bedroom types from response
  const ageBands = getBudgetHeatmapField(data, BudgetHeatmapField.AGE_BANDS) || [];
  const bedroomTypes = getBudgetHeatmapField(data, BudgetHeatmapField.BEDROOM_TYPES) || [1, 2, 3, 4, 5];
  const totalCount = getBudgetHeatmapField(data, BudgetHeatmapField.TOTAL_COUNT) || 0;
  const matrix = getBudgetHeatmapField(data, BudgetHeatmapField.MATRIX) || {};

  // Show warning for long time windows (48+ months)
  const showMarketShiftWarning = timeWindow >= 48;

  return (
    <ChartFrame
      status={status}
      isFiltering={isFetching && status === 'success'}
      error={error}
      onRetry={refetch}
      empty={!data || totalCount === 0}
      skeleton="grid"
      height={280}
    >
    <div className="weapon-card hud-corner weapon-shadow overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-mono-muted">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="font-semibold text-brand-navy">
              Bedroom Mix by Property Age
            </h4>
            <p className="text-xs text-brand-blue mt-0.5">
              Share of transactions in each age group (within your budget, last {timeWindow} months)
            </p>
          </div>

          {/* Time window buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {Object.keys(TIME_PRESETS).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTimePreset(preset)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  timePreset === preset
                    ? 'bg-brand-navy text-white'
                    : 'bg-white border border-brand-sky/50 text-brand-blue hover:bg-brand-sand/50'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Market shift warning for long time windows */}
        {showMarketShiftWarning && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Older transactions may reflect earlier price levels.</span>
          </div>
        )}
      </div>

      {/* Heatmap Table */}
      <div className="p-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left px-2 py-2 text-xs font-medium text-brand-blue w-44">
                Property Type
              </th>
              {bedroomTypes.map((br) => (
                <th
                  key={br}
                  className="text-center px-2 py-2 text-xs font-medium text-brand-blue min-w-[52px]"
                >
                  {getBedroomLabelShort(br)}
                </th>
              ))}
              <th className="text-center px-2 py-2 text-xs font-medium text-brand-blue min-w-[60px]">
                Count
              </th>
            </tr>
          </thead>
          <tbody>
            {ageBands.map((band) => {
              const rowData = matrix[band.key] || {};
              const rowTotal = getBudgetHeatmapRowField(rowData, BudgetHeatmapRowField.ROW_TOTAL) || 0;
              const isLowSample = getBudgetHeatmapRowField(rowData, BudgetHeatmapRowField.LOW_SAMPLE);

              return (
                <tr
                  key={band.key}
                  className={`border-t border-brand-sky/20 ${
                    isLowSample ? 'bg-stripes' : ''
                  }`}
                >
                  {/* Age band label */}
                  <td className="px-2 py-2 text-xs font-medium text-brand-navy">
                    <div className="flex items-center gap-2">
                      <span>{band.label}</span>
                      {isLowSample && (
                        <span className="text-[10px] text-brand-sky bg-brand-sky/10 px-1.5 py-0.5 rounded">
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
                      ? HEAT_EMPTY
                      : getHeatColor(pct);
                    const textColor = isSuppressed || isLowSample
                      ? INK.muted // slate-400
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
                        className="text-center px-2 py-2 text-xs font-mono tabular-nums transition-colors"
                        style={{ backgroundColor: bgColor, color: textColor }}
                        title={tooltipText}
                      >
                        {isSuppressed || isLowSample ? (
                          <span className="text-brand-sky">—</span>
                        ) : pct === 0 ? (
                          <span className="text-brand-sky">—</span>
                        ) : (
                          `${Math.round(pct)}%`
                        )}
                      </td>
                    );
                  })}

                  {/* Row total */}
                  <td className="text-center px-2 py-2 text-xs font-mono tabular-nums text-brand-blue bg-brand-sand/20">
                    {isLowSample ? (
                      <span className="text-brand-sky">{rowTotal}</span>
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
        <div className="px-4 py-3 bg-brand-sand/20 border-t border-brand-sky/30">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-brand-blue mt-0.5 flex-shrink-0"
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
            <p className="text-xs text-brand-blue">{data.insight}</p>
          </div>
        </div>
      )}

      {/* Footer: Disclaimer + Legend */}
      <div className="px-4 py-2 bg-brand-blue/5 border-t border-brand-sky/20">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-brand-sky">
          {/* Disclaimer */}
          <span>This reflects where buyers transact — not current listings.</span>

          {/* Legend */}
          <div className="flex items-center gap-2">
            <span>Distribution:</span>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-3 rounded border border-brand-sky/30"
                style={{ backgroundColor: HEAT_EMPTY }}
              />
              <span>Low</span>
            </div>
            <div
              className="w-12 h-3 rounded"
              style={{
                background: `linear-gradient(to right, ${CANVAS.grid}, ${REGION.RCR}, ${REGION.CCR})`,
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
    </ChartFrame>
  );
}

export default BudgetActivityHeatmap;
