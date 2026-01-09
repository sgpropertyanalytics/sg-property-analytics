import React, { useRef, useMemo } from 'react';
// Phase 2: Using TanStack Query via useTimeSeriesQuery (auto grain aggregation)
import { useTimeSeriesQuery, useDebugOverlay } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
// Chart.js components registered globally in chartSetup.js
import { Chart } from 'react-chartjs-2';
// Phase 3.2: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores';
import { getAggregate } from '../../api/client';
import { PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { CHART_COLORS } from '../../constants/colors';
// SaleType imports removed - Market Core is Resale-only
import { transformTimeSeries, logFetchDebug, assertKnownVersion, validateResponseGrain } from '../../adapters';
import { niceMax } from '../../utils/niceAxisMax';

/**
 * Time Trend Chart - Line + Bar Combo
 *
 * X-axis: Month (drillable up to Quarter/Year via client-side aggregation)
 * Y1 (bars): Transaction Count
 * Y2 (line): Total Transaction Value
 *
 * Uses useTimeSeriesQuery for instant grain toggle without API calls.
 */
// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

/**
 * @param {{
 *  height?: number,
 *  saleType?: string | null,
 *  staggerIndex?: number,
 *  onDrillThrough?: (value: string) => void,
 * }} props
 */
function TimeTrendChartBase({ height = 300, saleType = null, staggerIndex = 0, onDrillThrough: _onDrillThrough }) {
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters, timeGrouping } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  const districts = filters.districts?.join(',') || '';

  const chartRef = useRef(null);

  // Debug overlay for API diagnostics (toggle with Ctrl+Shift+D)
  const { captureRequest, captureResponse, captureError, DebugOverlay } = useDebugOverlay('TimeTrendChart');

  // Phase 4: Simplified data fetching - inline params, explicit query key
  const { data: safeData, status, error, refetch } = useTimeSeriesQuery({
    queryFn: async (signal) => {
      // Inline params - no buildApiParams abstraction
      const params = {
        group_by: 'month',
        metrics: 'count,total_value',
        timeframe,
        bedroom,
        district: districts,
        ...(saleType && { sale_type: saleType }),
      };

      captureRequest('/api/aggregate', params);

      try {
        const response = await getAggregate(params, { signal, priority: 'high' });
        assertKnownVersion(response.data, '/api/aggregate');

        const rawData = response.data || [];
        captureResponse(response, rawData.length);

        logFetchDebug('TimeTrendChart', {
          endpoint: '/api/aggregate',
          timeGrain: 'month',
          response: response.data,
          rowCount: rawData.length,
        });

        validateResponseGrain(rawData, 'month', 'TimeTrendChart');
        return transformTimeSeries(rawData);
      } catch (err) {
        captureError(err);
        throw err;
      }
    },
    // Explicit query key - TanStack handles cache deduplication
    deps: ['time-trend', timeframe, bedroom, districts, saleType],
    chartName: 'TimeTrendChart',
  });

  // Market Core is Resale-only - single transaction count bar + total value line
  const labels = safeData.map(d => d.period ?? '');
  // Since we're Resale-only, totalCount IS the resale count (no sale_type grouping)
  const transactionCounts = safeData.map(d => d.totalCount || 0);
  const totalValues = safeData.map(d => d.totalValue || 0);

  // Find peak values for axis scaling
  const maxCount = Math.max(...transactionCounts, 1);

  // Extend y axis (count) slightly to leave room for line above
  // Use niceMax to ensure human-readable tick boundaries (INV-11)
  const yAxisMax = niceMax(Math.ceil(maxCount * 1.4));

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Resale Transactions',
        data: transactionCounts,
        backgroundColor: CHART_COLORS.oceanAlpha(0.7),  // Ocean blue - brand palette
        borderColor: CHART_COLORS.ocean,  // Ocean border for definition
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Total Transaction Value',
        data: totalValues,
        borderColor: CHART_COLORS.navy,  // Slate 900 - bold, pops forward
        backgroundColor: CHART_COLORS.navyAlpha05,
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: CHART_COLORS.slate200,  // Slate 200 fill on hover
        pointHoverBorderColor: CHART_COLORS.navy,
        pointHoverBorderWidth: 2,
        tension: 0.3,
        fill: false,
        yAxisID: 'y1',
        order: 1,
      },
    ],
  };

  const options = useMemo(() => ({
    ...baseChartJsOptions,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'bottom',
        align: 'start',
        labels: {
          usePointStyle: true,
          pointStyle: 'rectRounded',
          padding: 20,
          font: { size: 12, weight: '500' },
          color: CHART_COLORS.slate500,
          boxWidth: 12,
          boxHeight: 12,
        },
      },
      tooltip: {
        backgroundColor: CHART_COLORS.navyAlpha95,  // Slate 900
        titleColor: CHART_COLORS.slate100,  // Slate 100
        bodyColor: CHART_COLORS.slate400,   // Slate 400
        borderColor: CHART_COLORS.slate500Alpha30,
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        titleFont: { weight: '600', size: 13 },
        bodyFont: { size: 12 },
        displayColors: true,
        boxPadding: 6,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label === 'Total Transaction Value') {
              if (value >= 1000000000) {
                return `  ${label}: $${(value / 1000000000).toFixed(2)}B`;
              }
              return `  ${label}: $${(value / 1000000).toFixed(0)}M`;
            }
            return `  ${label}: ${value.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        max: yAxisMax,
        border: { display: false },
        title: {
          display: true,
          text: 'Transaction Count',
          ...CHART_AXIS_DEFAULTS.title,
        },
        grid: {
          color: CHART_COLORS.skyAlpha15,  // Sky at 15%
          drawTicks: false,
        },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => Math.round(value).toLocaleString(),
          padding: 8,
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0,
        border: { display: false },
        title: {
          display: true,
          text: 'Total Value ($)',
          ...CHART_AXIS_DEFAULTS.title,
        },
        grid: { drawOnChartArea: false },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => {
            if (value >= 1000000000) {
              return `$${(value / 1000000000).toFixed(1)}B`;
            }
            return `$${(value / 1000000).toFixed(0)}M`;
          },
          padding: 8,
        },
      },
    },
  }), [yAxisMax]);

  // Card layout: flex column with fixed height, header shrink-0, chart fills remaining
  // Added extra height for bottom legend
  const cardHeight = height + 120;

  return (
    <ChartFrame
      status={status}
      isFiltering={false}
      error={error}
      onRetry={refetch}
      empty={!safeData || safeData.length === 0}
      skeleton="bar"
      height={height + 80}
      staggerIndex={staggerIndex}
    >
      <div
        className="weapon-card hud-corner weapon-shadow overflow-hidden flex flex-col relative"
        style={{ height: cardHeight }}
      >
        {/* Debug overlay - shows API call info when Ctrl+Shift+D is pressed */}
        <DebugOverlay />
        {/* Header - refined typography */}
        <div className="px-5 py-4 border-b border-mono-muted shrink-0">
          <div className="flex items-baseline justify-between">
            <h3 className="text-base font-semibold text-brand-navy tracking-tight">
              Resale Volume & Quantum
            </h3>
            <span className="text-[10px] font-medium text-brand-sky uppercase tracking-wider">
              {TIME_LABELS[timeGrouping]}
            </span>
          </div>
        </div>
        {/* Chart slot - flex-1 min-h-0 with h-full w-full inner wrapper */}
        {/* Chart slot - Chart.js handles data updates efficiently without key remount */}
        <ChartSlot>
          <PreviewChartOverlay chartRef={chartRef}>
            <Chart ref={chartRef} type="bar" data={chartData} options={options} />
          </PreviewChartOverlay>
        </ChartSlot>
      </div>
    </ChartFrame>
  );
}

export const TimeTrendChart = React.memo(TimeTrendChartBase);

export default TimeTrendChart;
