import React, { useRef, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { usePowerBIFilters, TIME_GROUP_BY } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
// SaleType imports removed - Market Core is Resale-only
import { transformTimeSeries, logFetchDebug, assertKnownVersion } from '../../adapters';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend
);

/**
 * Time Trend Chart - Line + Bar Combo
 *
 * X-axis: Month (drillable up to Quarter/Year)
 * Y1 (bars): Transaction Count
 * Y2 (line): Median PSF
 */
// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

export function TimeTrendChart({ height = 300, saleType = null }) {
  // Use global timeGrouping from context (controlled by toolbar toggle)
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey, timeGrouping } = usePowerBIFilters();
  const chartRef = useRef(null);

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

      const response = await getAggregate(params, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/aggregate');

      const rawData = response.data?.data || [];

      // Debug logging (dev only)
      logFetchDebug('TimeTrendChart', {
        endpoint: '/api/aggregate',
        timeGrain: timeGrouping,
        response: response.data,
        rowCount: rawData.length,
      });

      // Use adapter for transformation (schema-safe, sorted)
      // getPeriod() handles v1/v2 field normalization automatically
      return transformTimeSeries(rawData, timeGrouping);
    },
    [debouncedFilterKey, timeGrouping, saleType],
    { initialData: [] }
  );

  // Market Core is Resale-only - single transaction count bar + total value line
  const labels = data.map(d => d.period ?? '');
  // Since we're Resale-only, totalCount IS the resale count (no sale_type grouping)
  const transactionCounts = data.map(d => d.totalCount || 0);
  const totalValues = data.map(d => d.totalValue || 0);

  // Find peak values for axis scaling
  const maxCount = Math.max(...transactionCounts, 1);

  // Extend y axis (count) slightly to leave room for line above
  const yAxisMax = Math.ceil(maxCount * 1.4); // Bars occupy ~70% of chart height

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Resale Transactions',
        data: transactionCounts,
        backgroundColor: 'rgba(84, 119, 146, 0.9)',  // Ocean Blue #547792
        borderColor: 'rgba(84, 119, 146, 1)',
        borderWidth: 1,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Total Transaction Value',
        data: totalValues,
        borderColor: '#8B7355',  // Dark tan/brown for better visibility
        backgroundColor: 'rgba(139, 115, 85, 0.1)',
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: '#A89078',  // Medium tan fill
        pointBorderColor: '#8B7355',  // Dark tan border
        pointBorderWidth: 1,
        tension: 0.4,  // Smooth curve
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
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label === 'Total Transaction Value') {
              // Format in millions or billions
              if (value >= 1000000000) {
                return `${label}: $${(value / 1000000000).toFixed(2)}B`;
              }
              return `${label}: $${(value / 1000000).toFixed(0)}M`;
            }
            return `${label}: ${value.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        max: yAxisMax, // Extended max to push bars lower, leaving room for line above
        title: {
          display: true,
          text: 'Transaction Count',
        },
        grid: {
          drawOnChartArea: true,
        },
        ticks: {
          callback: (value) => Math.round(value).toLocaleString(), // Fix floating point precision
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0, // Grounded at $0M
        title: {
          display: true,
          text: 'Total Transaction Value ($)',
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          callback: (value) => {
            if (value >= 1000000000) {
              return `$${(value / 1000000000).toFixed(1)}B`;
            }
            return `$${(value / 1000000).toFixed(0)}M`;
          },
        },
      },
    },
  }), [data, yAxisMax]);

  // Card layout: flex column with fixed height, header shrink-0, chart fills remaining
  const cardHeight = height + 90; // height prop for chart + ~90px for header

  return (
    <QueryState loading={loading} error={error} onRetry={refetch} empty={!data || data.length === 0} skeleton="bar" height={height + 80}>
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
        {/* Header - shrink-0 */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[#213448]">Transaction Trend</h3>
          </div>
          <p className="text-xs text-[#547792] mt-1">
            Volume and price by {TIME_LABELS[timeGrouping]}
          </p>
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
}

export default TimeTrendChart;
