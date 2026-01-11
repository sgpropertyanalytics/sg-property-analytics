import React, { useRef, useMemo } from 'react';
// Phase 2: Using TanStack Query via useTimeSeriesQuery (auto grain aggregation)
import { useTimeSeriesQuery, useDebugOverlay } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
// Chart.js components registered globally in chartSetup.js
import { Chart } from 'react-chartjs-2';
// Phase 3.2: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores';
import { getAggregate } from '../../api/client';
import {
  PreviewChartOverlay,
  DataCard,
  DataCardHeader,
  DataCardCanvas,
  StatusDeck,
  StatusPeriod,
  StatusCount,
  LegendLine,
} from '../ui';
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
 *  embedded?: boolean,
 *  cinema?: boolean,
 *  onDrillThrough?: (value: string) => void,
 * }} props
 */
function TimeTrendChartBase({ height = 300, saleType = null, staggerIndex = 0, embedded = false, cinema = false, onDrillThrough: _onDrillThrough }) {
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
        label: 'Volume',
        data: transactionCounts,
        // Ocean blue with alpha - consistent with design system
        backgroundColor: CHART_COLORS.oceanAlpha(0.6),
        borderColor: CHART_COLORS.ocean,
        borderWidth: 1,
        borderRadius: 0,
        // Dense bars - "skyline not fence"
        barPercentage: 0.85,
        categoryPercentage: 0.9,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Quantum',
        data: totalValues,
        // Navy - bold signal line
        borderColor: CHART_COLORS.navy,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: CHART_COLORS.white,
        pointHoverBorderColor: CHART_COLORS.navy,
        pointHoverBorderWidth: 2,
        cubicInterpolationMode: 'monotone',
        tension: 0.4,
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
      // Legend disabled - using StatusDeck footer instead
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: CHART_COLORS.navyAlpha95,
        titleColor: CHART_COLORS.slate100,
        bodyColor: CHART_COLORS.slate300,
        borderColor: CHART_COLORS.ocean,
        borderWidth: 1,
        cornerRadius: 0,
        padding: 12,
        titleFont: { weight: '600', size: 11, family: "'JetBrains Mono', monospace" },
        bodyFont: { size: 10, family: "'JetBrains Mono', monospace" },
        displayColors: true,
        boxPadding: 4,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label === 'Quantum') {
              if (value >= 1000000000) {
                return ` ${label}: $${(value / 1000000000).toFixed(2)}B`;
              }
              return ` ${label}: $${(value / 1000000).toFixed(0)}M`;
            }
            return ` ${label}: ${value.toLocaleString()}`;
          },
        },
      },
      // Crosshair plugin - vertical line on hover
      crosshair: {
        line: {
          color: CHART_COLORS.slate400,
          width: 1,
          dashPattern: [4, 4],
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: true,
          color: CHART_COLORS.skyAlpha15,
          lineWidth: 1,
          drawTicks: false,
        },
        border: {
          display: true,
          color: CHART_COLORS.slate300,
          width: 1,
        },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          font: { size: 10, family: "'JetBrains Mono', monospace" },
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        min: 0,
        max: yAxisMax,
        border: {
          display: true,
          color: CHART_COLORS.slate300,
          width: 1,
        },
        title: {
          display: true,
          text: 'VOLUME',
          font: { size: 9, family: "'JetBrains Mono', monospace", weight: '600' },
          color: CHART_COLORS.slate500,
        },
        grid: {
          color: CHART_COLORS.skyAlpha20,
          lineWidth: 1,
          drawTicks: false,
          borderDash: [3, 3],
        },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          font: { size: 10, family: "'JetBrains Mono', monospace" },
          callback: (value) => Math.round(value).toLocaleString(),
          padding: 8,
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0,
        border: {
          display: true,
          color: CHART_COLORS.slate300,
          width: 1,
        },
        title: {
          display: true,
          text: 'QUANTUM ($)',
          font: { size: 9, family: "'JetBrains Mono', monospace", weight: '600' },
          color: CHART_COLORS.slate500,
        },
        grid: { drawOnChartArea: false },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          font: { size: 10, family: "'JetBrains Mono', monospace" },
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

  // Calculate total transactions for StatusDeck
  const totalTransactions = transactionCounts.reduce((sum, c) => sum + c, 0);

  // Methodology text for (i) tooltip
  const methodologyText = `Volume — Monthly resale transaction count.
Quantum — Total transaction value (linear).
Grouped by ${TIME_LABELS[timeGrouping]}.`;

  return (
    <ChartFrame
      status={status}
      isFiltering={false}
      error={error}
      onRetry={refetch}
      empty={!safeData || safeData.length === 0}
      skeleton="bar"
      height={height + 40}
      staggerIndex={staggerIndex}
    >
      <DataCard variant={embedded ? 'embedded' : 'standalone'}>
        {/* Debug overlay - shows API call info when Ctrl+Shift+D is pressed */}
        <DebugOverlay />

        {/* Layer 1: Header - h-14 fixed */}
        <DataCardHeader
          title="Resale Volume & Quantum"
          subtitle={`Grouped by ${TIME_LABELS[timeGrouping]}`}
          info={methodologyText}
        />

        {/* Layer 2: Canvas - flex-grow */}
        <DataCardCanvas minHeight={height} cinema={cinema}>
          <PreviewChartOverlay chartRef={chartRef}>
            <Chart ref={chartRef} type="bar" data={chartData} options={options} />
          </PreviewChartOverlay>
        </DataCardCanvas>

        {/* Layer 3: StatusDeck - h-10 fixed footer with legend */}
        <StatusDeck
          left={<StatusPeriod>{safeData.length} Periods ({TIME_LABELS[timeGrouping]})</StatusPeriod>}
          right={<StatusCount count={totalTransactions} />}
        >
          <LegendLine label="Volume" color={CHART_COLORS.ocean} />
          <LegendLine label="Quantum" color={CHART_COLORS.navy} />
        </StatusDeck>
      </DataCard>
    </ChartFrame>
  );
}

export const TimeTrendChart = React.memo(TimeTrendChartBase);

export default TimeTrendChart;
