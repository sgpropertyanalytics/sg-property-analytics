/**
 * PriceBandChart - Historical Downside Protection Visualization
 *
 * Displays P25/P50/P75 percentile bands for a project's resale transactions.
 * Shows where a user's unit PSF sits relative to historical price floors.
 *
 * Visual Elements:
 * - Filled band P25-P50 (light green - protected zone)
 * - Filled band P50-P75 (light red - premium/caution zone)
 * - Solid P50 median line (navy)
 * - Dashed P25/P75 boundary lines (light blue)
 * - Unit dot marker (if unitPsf provided)
 */

import { useMemo, useRef } from 'react';
import { ChartSkeleton } from '../common/ChartSkeleton';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import { isFloorDirection, FloorDirectionLabels } from '../../schemas/apiContract';
import { ChartSlot } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { VerdictBadge, VerdictBadgeLarge } from './VerdictBadge';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  annotationPlugin
);

// Colors
const COLORS = {
  navy: '#213448',
  oceanBlue: '#547792',
  skyBlue: '#94B4C1',
  sand: '#EAE0CF',
  protectedFill: 'rgba(16, 185, 129, 0.12)', // Light green
  cautionFill: 'rgba(239, 68, 68, 0.12)',    // Light red
  unitMarker: '#547792',
};

export function PriceBandChart({
  bands = [],
  latest,
  trend,
  verdict,
  unitPsf,
  dataSource: _dataSource = 'project',
  proxyLabel,
  dataQuality,
  totalResaleTransactions,
  loading = false,
  error = null,
  projectName = '',
  height = 400
}) {
  const chartRef = useRef(null);

  // Transform bands data for Chart.js
  const chartData = useMemo(() => {
    if (!bands || bands.length === 0) return null;

    const labels = bands.map(b => b.month);
    const p25Data = bands.map(b => b.p25_s ?? b.p25);
    const p50Data = bands.map(b => b.p50_s ?? b.p50);
    const p75Data = bands.map(b => b.p75_s ?? b.p75);

    return {
      labels,
      datasets: [
        // P25 floor line (fills up to P50 with green)
        {
          label: 'P25 (Floor)',
          data: p25Data,
          fill: {
            target: 1, // Fill towards P50 (index 1)
            below: COLORS.protectedFill, // Green when P25 < P50
          },
          borderColor: COLORS.skyBlue,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: COLORS.skyBlue,
          tension: 0.3,
          spanGaps: false, // Gap when null
          order: 3, // Draw first (bottom)
        },
        // P50 median line (solid, no fill)
        {
          label: 'Median (P50)',
          data: p50Data,
          fill: false,
          borderColor: COLORS.navy,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: COLORS.navy,
          tension: 0.3,
          spanGaps: false,
          order: 1, // Draw last (on top)
        },
        // P75 ceiling line (fills down to P50 with red)
        {
          label: 'P75 (Ceiling)',
          data: p75Data,
          fill: {
            target: 1, // Fill towards P50 (index 1)
            above: COLORS.cautionFill, // Red when P75 > P50
          },
          borderColor: COLORS.skyBlue,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: COLORS.skyBlue,
          tension: 0.3,
          spanGaps: false,
          order: 2, // Draw second
        },
      ],
    };
  }, [bands]);

  // Chart options with annotations for unit marker
  const options = useMemo(() => {
    const annotations = {};

    // Add unit marker annotation if unitPsf is provided
    if (unitPsf && bands.length > 0) {
      const lastIndex = bands.length - 1;

      annotations.unitMarker = {
        type: 'point',
        xValue: lastIndex,
        yValue: unitPsf,
        backgroundColor: COLORS.unitMarker,
        borderColor: '#fff',
        borderWidth: 2,
        radius: 8,
        drawTime: 'afterDatasetsDraw',
      };

      annotations.unitLabel = {
        type: 'label',
        xValue: lastIndex,
        yValue: unitPsf,
        content: `$${unitPsf.toLocaleString()} psf`,
        backgroundColor: 'rgba(33, 52, 72, 0.9)',
        color: '#fff',
        font: { size: 11, weight: 'bold' },
        padding: { x: 6, y: 4 },
        borderRadius: 4,
        position: { x: 'end', y: 'start' },
        xAdjust: 10,
        yAdjust: -10,
      };
    }

    return {
      ...baseChartJsOptions,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'line',
            boxWidth: 30,
            padding: 15,
            font: { size: 11 },
            color: COLORS.oceanBlue,
            filter: (_item) => {
              // Show all three legends
              return true;
            },
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(33, 52, 72, 0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: COLORS.skyBlue,
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx !== undefined && bands[idx]) {
                return `${bands[idx].month}`;
              }
              return '';
            },
            label: (context) => {
              const value = context.parsed?.y;
              if (value == null) return null;
              return `${context.dataset.label}: $${value.toLocaleString()} psf`;
            },
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx !== undefined && bands[idx]) {
                const count = bands[idx].count;
                if (count) {
                  return [`Trades: ${count}`];
                }
              }
              return [];
            },
          },
        },
        annotation: {
          annotations,
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
          title: {
            display: true,
            text: 'Month',
            ...CHART_AXIS_DEFAULTS.title,
          },
        },
        y: {
          grid: {
            color: `${COLORS.skyBlue}30`,
          },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            callback: (value) => `$${value.toLocaleString()}`,
          },
          title: {
            display: true,
            text: 'PSF ($/sqft)',
            ...CHART_AXIS_DEFAULTS.title,
          },
        },
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false,
      },
    };
  }, [bands, unitPsf]);

  // Loading state
  if (loading) {
    return <ChartSkeleton type="line" height={height} />;
  }

  // Error state
  if (error) {
    return (
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col overflow-hidden"
        style={{ height }}
      >
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="font-semibold text-[#213448]">Historical Price Bands</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-red-500 mb-2">Error loading data</div>
            <div className="text-sm text-[#547792]">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!chartData || bands.length === 0) {
    return (
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col overflow-hidden"
        style={{ height }}
      >
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="font-semibold text-[#213448]">Historical Price Bands</h3>
          <p className="text-xs text-[#547792] mt-1">P25 / Median / P75 percentiles</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-50">📊</div>
            <div className="text-[#547792]">
              {projectName
                ? 'Insufficient resale data for this project'
                : 'Select a project to view price bands'}
            </div>
            {dataQuality?.fallback_reason && (
              <div className="text-sm text-[#94B4C1] mt-2">
                {dataQuality.fallback_reason}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Card owns its height explicitly (header ~80px + chart area + footer ~44px)
  const cardHeight = height + 124;

  // Main chart view
  return (
    <div
      className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col overflow-hidden"
      style={{ height: cardHeight }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[#213448] truncate">
              Historical Downside Protection
              {projectName && (
                <span className="font-normal text-[#547792]"> — {projectName}</span>
              )}
            </h3>
            <p className="text-xs text-[#547792] mt-1">
              P25 / Median / P75 resale price bands, last {dataQuality?.window_months || 24} months
              {proxyLabel && (
                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                  {proxyLabel}
                </span>
              )}
            </p>
          </div>

          {/* Verdict badge */}
          {verdict && (
            <VerdictBadge
              badge={verdict.badge}
              label={verdict.badge_label}
              tooltip={verdict.explanation}
            />
          )}
        </div>

        {/* Floor trend indicator */}
        {trend && !isFloorDirection.unknown(trend.floor_direction) && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-[#547792]">Floor trend:</span>
            <span className={`
              text-xs font-medium px-2 py-0.5 rounded
              ${isFloorDirection.rising(trend.floor_direction)
                ? 'bg-emerald-100 text-emerald-700'
                : isFloorDirection.weakening(trend.floor_direction)
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
              }
            `}>
              {FloorDirectionLabels[trend.floor_direction] || trend.floor_direction}
              {trend.floor_slope_pct !== null && (
                <span className="ml-1 opacity-75">
                  ({trend.floor_slope_pct >= 0 ? '+' : ''}{trend.floor_slope_pct.toFixed(1)}%)
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Verdict explanation (if unitPsf provided) */}
      {verdict && (
        <div className="px-4 pt-3 shrink-0">
          <VerdictBadgeLarge
            badge={verdict.badge}
            label={verdict.badge_label}
            explanation={verdict.explanation}
            position={verdict.position_label}
            vsFloorPct={verdict.vs_floor_pct}
          />
        </div>
      )}

      {/* Chart */}
      <ChartSlot>
        <Line ref={chartRef} data={chartData} options={options} />
      </ChartSlot>

      {/* Footer */}
      <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between text-xs text-[#547792]">
        <span className="min-w-0 truncate flex-1">
          {totalResaleTransactions != null && totalResaleTransactions !== dataQuality?.total_trades ? (
            <>
              {totalResaleTransactions} total resales • {dataQuality?.total_trades || 0} in price bands
            </>
          ) : (
            <>{dataQuality?.total_trades || 0} resale trades</>
          )}
          {' '}• {dataQuality?.months_with_data || 0} months with data
          {dataQuality?.smoothing && (
            <span className="opacity-75 ml-1">• 3-month smoothed</span>
          )}
        </span>
        {latest && (
          <span className="text-[#213448] shrink-0 hidden sm:block">
            Latest: P25 ${latest.p25_s?.toLocaleString() || '-'} |
            Median ${latest.p50_s?.toLocaleString() || '-'} |
            P75 ${latest.p75_s?.toLocaleString() || '-'}
          </span>
        )}
      </div>

      {/* Data quality warnings */}
      {dataQuality && (dataQuality.total_trades < 20 || !dataQuality.is_valid) && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-700">
          <span className="font-medium">Note:</span>{' '}
          {dataQuality.total_trades < 20
            ? 'Limited resale volume — bands may be less stable.'
            : dataQuality.fallback_reason || 'Using proxy data due to low project volume.'}
        </div>
      )}
    </div>
  );
}

export default PriceBandChart;
