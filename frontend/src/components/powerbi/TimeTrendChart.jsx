import React, { useRef, useMemo, useEffect, useState } from 'react';
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
 * Create diagonal hatch pattern for Chart.js bars
 * Mimics architectural/blueprint drawing style
 */
function createHatchPattern(strokeColor = '#547792', bgColor = 'rgba(84, 119, 146, 0.15)') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const size = 8;
  canvas.width = size;
  canvas.height = size;

  // Background fill (subtle)
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  // Diagonal lines
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.stroke();

  return ctx.createPattern(canvas, 'repeat');
}

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

  // Create hatch pattern for blueprint-style bars
  const [hatchPattern, setHatchPattern] = useState(null);
  useEffect(() => {
    // Create pattern on mount (requires DOM)
    const pattern = createHatchPattern('#547792', 'rgba(84, 119, 146, 0.12)');
    setHatchPattern(pattern);
  }, []);

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
        // Blueprint aesthetic: hatch pattern fill with solid stroke
        backgroundColor: hatchPattern || CHART_COLORS.oceanAlpha(0.15),
        borderColor: CHART_COLORS.ocean,  // Solid stroke defines the bar
        borderWidth: 1.5,
        borderRadius: 0,  // Sharp corners - architectural/technical look
        barPercentage: 0.7,  // Thinner bars for precision feel
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Total Transaction Value',
        data: totalValues,
        borderColor: CHART_COLORS.navy,  // Dark navy - bold signal line
        backgroundColor: 'transparent',
        borderWidth: 2.5,  // Thicker for visual hierarchy
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: CHART_COLORS.white,
        pointHoverBorderColor: CHART_COLORS.navy,
        pointHoverBorderWidth: 2,
        stepped: 'middle',  // Technical stepped interpolation - emphasizes discrete data points
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
          pointStyle: 'rect',  // Sharp rectangle - matches angular aesthetic
          padding: 20,
          font: { size: 11, family: "'JetBrains Mono', monospace", weight: '500' },
          color: CHART_COLORS.slate600,
          boxWidth: 10,
          boxHeight: 10,
        },
      },
      tooltip: {
        backgroundColor: CHART_COLORS.navyAlpha95,
        titleColor: CHART_COLORS.slate100,
        bodyColor: CHART_COLORS.slate300,
        borderColor: CHART_COLORS.ocean,
        borderWidth: 1,
        cornerRadius: 0,  // Sharp corners - technical aesthetic
        padding: 12,
        titleFont: { weight: '600', size: 12, family: "'JetBrains Mono', monospace" },
        bodyFont: { size: 11, family: "'JetBrains Mono', monospace" },
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
        max: yAxisMax,
        border: {
          display: true,
          color: CHART_COLORS.slate300,
          width: 1,
        },
        title: {
          display: true,
          text: 'TRANSACTION COUNT',
          font: { size: 9, family: "'JetBrains Mono', monospace", weight: '600' },
          color: CHART_COLORS.slate500,
        },
        grid: {
          color: CHART_COLORS.skyAlpha20,
          lineWidth: 1,
          drawTicks: false,
          // Dashed grid lines for technical precision
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
          text: 'TOTAL VALUE ($)',
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
      <DataCard height={cardHeight}>
        {/* Debug overlay - shows API call info when Ctrl+Shift+D is pressed */}
        <DebugOverlay />

        {/* Layer 1: Control Header */}
        <DataCardHeader
          title="Resale Volume & Quantum"
          subtitle={`Grouped by ${TIME_LABELS[timeGrouping]}`}
        />

        {/* Layer 3: Canvas - Chart takes remaining space */}
        <DataCardCanvas>
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
