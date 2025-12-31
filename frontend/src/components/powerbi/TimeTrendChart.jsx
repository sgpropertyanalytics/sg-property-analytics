import React, { useRef, useMemo } from 'react';
import { useAbortableQuery, useDebugOverlay } from '../../hooks';
import { QueryState } from '../common/QueryState';
// Chart.js components registered globally in chartSetup.js
import { Chart } from 'react-chartjs-2';
import { usePowerBIFilters, TIME_GROUP_BY } from '../../context/PowerBIFilter';
import { getAggregate } from '../../api/client';
import { PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
// SaleType imports removed - Market Core is Resale-only
import { transformTimeSeries, logFetchDebug, assertKnownVersion } from '../../adapters';
import { niceMax } from '../../utils/niceAxisMax';

/**
 * Time Trend Chart - Line + Bar Combo
 *
 * X-axis: Month (drillable up to Quarter/Year)
 * Y1 (bars): Transaction Count
 * Y2 (line): Median PSF
 */
// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

export const TimeTrendChart = React.memo(function TimeTrendChart({ height = 300, saleType = null }) {
  // Use global timeGrouping from context (controlled by toolbar toggle)
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey, timeGrouping } = usePowerBIFilters();
  const chartRef = useRef(null);

  // Debug overlay for API diagnostics (toggle with Ctrl+Shift+D)
  const { captureRequest, captureResponse, captureError, DebugOverlay } = useDebugOverlay('TimeTrendChart');

  // Fetch and transform data using adapter pattern
  // useAbortableQuery handles: abort controller, stale request protection, loading/error states
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // saleType is passed from page level - see CLAUDE.md "Business Logic Enforcement"
      const params = buildApiParams({
        group_by: TIME_GROUP_BY[timeGrouping],
        metrics: 'count,total_value',
        ...(saleType && { sale_type: saleType }),
      });

      // Capture request for debug overlay
      captureRequest('/api/aggregate', params);

      try {
        const response = await getAggregate(params, { signal, priority: 'high' });

        // Validate API contract version (dev/test only)
        assertKnownVersion(response.data, '/api/aggregate');

        const rawData = response.data || [];

        // Capture response for debug overlay
        captureResponse(response, rawData.length);

        // Debug logging (dev only)
        logFetchDebug('TimeTrendChart', {
          endpoint: '/api/aggregate',
          timeGrain: timeGrouping,
          response: response.data,
          rowCount: rawData.length,
        });

        // Use adapter for transformation (schema-safe, sorted)
        return transformTimeSeries(rawData, timeGrouping);
      } catch (err) {
        captureError(err);
        throw err;
      }
    },
    [debouncedFilterKey, timeGrouping, saleType],
    { initialData: [], keepPreviousData: true }
  );

  // Market Core is Resale-only - single transaction count bar + total value line
  const labels = data.map(d => d.period ?? '');
  // Since we're Resale-only, totalCount IS the resale count (no sale_type grouping)
  const transactionCounts = data.map(d => d.totalCount || 0);
  const totalValues = data.map(d => d.totalValue || 0);

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
        backgroundColor: 'rgba(148, 180, 193, 0.7)',  // Sky #94B4C1 - light, recedes
        borderColor: '#547792',  // Blue border for definition
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Total Transaction Value',
        data: totalValues,
        borderColor: '#213448',  // Navy - bold, pops forward
        backgroundColor: 'rgba(33, 52, 72, 0.05)',
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#EAE0CF',  // Sand fill on hover
        pointHoverBorderColor: '#213448',
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
          color: '#547792',
          boxWidth: 12,
          boxHeight: 12,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(33, 52, 72, 0.95)',  // Navy
        titleColor: '#EAE0CF',  // Sand
        bodyColor: '#94B4C1',   // Sky
        borderColor: 'rgba(148, 180, 193, 0.3)',
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
          color: 'rgba(148, 180, 193, 0.15)',  // Sky at 15%
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
    <QueryState loading={loading} error={error} onRetry={refetch} empty={!data || data.length === 0} skeleton="bar" height={height + 80}>
      <div
        className="bg-card rounded-lg border border-[#94B4C1]/30 overflow-hidden flex flex-col shadow-sm relative"
        style={{ height: cardHeight }}
      >
        {/* Debug overlay - shows API call info when Ctrl+Shift+D is pressed */}
        <DebugOverlay />
        {/* Header - refined typography */}
        <div className="px-5 py-4 border-b border-[#94B4C1]/20 shrink-0">
          <div className="flex items-baseline justify-between">
            <h3 className="text-base font-semibold text-[#213448] tracking-tight">
              Resale Volume & Quantum
            </h3>
            <span className="text-[10px] font-medium text-[#94B4C1] uppercase tracking-wider">
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
    </QueryState>
  );
});

export default TimeTrendChart;
