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
} from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { CHART_COLORS, SIGNAL, alpha } from '../../constants/colors';
// SaleType imports removed - Market Core is Resale-only
import { transformTimeSeries, logFetchDebug, assertKnownVersion, validateResponseGrain } from '../../adapters';
import { niceMax } from '../../utils/niceAxisMax';

// Technical Archival color palette
const ARCHIVAL = {
  barFill: '#64748B',           // Slate-500 - solid muted gray-blue
  barBorder: '#475569',         // Slate-600 - darker border
  lineStroke: '#C9A24D',        // Muted Amber - elegant line
  axisText: '#7A5C26',          // Deep amber - authoritative axis text
  axisSpine: '#B89A55',         // Warm spine - grounds the numbers
  gridLine: '#E2E8F0',          // Slate-200 - faint horizontal grid
};

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
        label: 'Volume',
        data: transactionCounts,
        // Technical Archival: solid slate fill with darker border
        backgroundColor: ARCHIVAL.barFill,
        borderColor: ARCHIVAL.barBorder,
        borderWidth: 1,
        borderRadius: 0,  // Sharp corners - brutalist aesthetic
        // Dense bars - "skyline not fence" (70-80% of slot)
        barPercentage: 0.85,
        categoryPercentage: 0.9,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Quantum',
        data: totalValues,
        // Technical Archival: Muted Amber - elegant against slate bars
        borderColor: ARCHIVAL.lineStroke,
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,  // No dots - clean data stream
        pointHoverRadius: 4,
        pointHoverBackgroundColor: ARCHIVAL.lineStroke,
        pointHoverBorderColor: CHART_COLORS.white,
        pointHoverBorderWidth: 2,
        // MonotoneX - tensioned wire, no overshoot
        cubicInterpolationMode: 'monotone',
        tension: 0.4,  // Chart.js monotone needs ~0.4 for proper monotone behavior
        fill: false,
        yAxisID: 'y1',
        order: 1,
      },
    ],
  };

  const options = useMemo(() => ({
    ...baseChartJsOptions,
    // Reserve ~20% space at top for legend (doesn't overlap chart elements)
    layout: {
      padding: {
        top: 40,  // Space for legend
        right: 8,
        bottom: 8,
        left: 8,
      },
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'center',
        labels: {
          usePointStyle: true,
          pointStyle: 'rect',
          boxWidth: 12,
          boxHeight: 12,
          padding: 20,
          font: { size: 10, family: "'JetBrains Mono', monospace", weight: '600' },
          color: CHART_COLORS.slate700,
        },
      },
      tooltip: {
        // Terminal readout style - dark bg, monospace, square corners
        backgroundColor: CHART_COLORS.slate900,
        titleColor: CHART_COLORS.slate100,
        bodyColor: CHART_COLORS.slate300,
        borderColor: CHART_COLORS.slate700,
        borderWidth: 1,
        cornerRadius: 0,  // Square - terminal aesthetic
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
          display: false,  // No vertical gridlines - cleaner archival look
        },
        border: {
          display: true,
          color: CHART_COLORS.slate800,  // Darker border
          width: 1,
        },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          font: { size: 10, family: "'JetBrains Mono', monospace" },
          maxRotation: 0,  // Horizontal labels
          minRotation: 0,
          // Reduce tick density - show every Nth label based on data length
          autoSkip: true,
          maxTicksLimit: 12,  // Max ~12 ticks (quarterly for 3 years)
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
          color: CHART_COLORS.slate800,
          width: 1,
        },
        title: {
          display: true,
          text: 'VOLUME',
          font: { size: 9, family: "'JetBrains Mono', monospace", weight: '600' },
          color: CHART_COLORS.slate500,
        },
        grid: {
          color: ARCHIVAL.gridLine,  // Faint slate-200 - engineering paper
          lineWidth: 1,
          drawTicks: false,
          borderDash: [3, 3],  // Dotted horizontal gridlines
        },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          font: { size: 10, family: "'JetBrains Mono', monospace", weight: '500' },
          callback: (value) => Math.round(value).toLocaleString(),
          padding: 8,
          count: 6,  // Sync with right axis for unified grid
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0,
        border: {
          display: true,
          color: ARCHIVAL.axisSpine,  // Visible warm spine - grounds the numbers
          width: 1.5,
        },
        title: {
          display: true,
          text: 'QUANTUM ($)',
          font: { size: 9, family: "'JetBrains Mono', monospace", weight: '600', letterSpacing: '0.04em' },
          color: ARCHIVAL.axisText,  // Deep amber - authoritative
        },
        grid: { drawOnChartArea: false },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          font: { size: 10, family: "'JetBrains Mono', monospace", weight: '500' },
          color: ARCHIVAL.axisText,  // Decoupled from line - stronger readability
          callback: (value) => {
            if (value >= 1000000000) {
              return `$${(value / 1000000000).toFixed(1)}B`;
            }
            return `$${(value / 1000000).toFixed(0)}M`;
          },
          padding: 8,
          count: 6,  // Sync with left axis for unified grid
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
      {/* Technical Archival container: 1px solid black border */}
      <DataCard className="border-slate-800">
        {/* Debug overlay - shows API call info when Ctrl+Shift+D is pressed */}
        <DebugOverlay />

        {/* Layer 1: Header - h-14 fixed */}
        <DataCardHeader
          title="Resale Volume & Quantum"
          subtitle={`Grouped by ${TIME_LABELS[timeGrouping]}`}
          info={methodologyText}
          metadata={<><span className="font-bold text-slate-700">{totalTransactions.toLocaleString()}</span> Txns</>}
        />

        {/* Layer 3: Canvas - flex-grow (legend inside chart at top center) */}
        <DataCardCanvas minHeight={height}>
          <PreviewChartOverlay chartRef={chartRef}>
            <Chart ref={chartRef} type="bar" data={chartData} options={options} />
          </PreviewChartOverlay>
        </DataCardCanvas>
      </DataCard>
    </ChartFrame>
  );
}

export const TimeTrendChart = React.memo(TimeTrendChartBase);

export default TimeTrendChart;
