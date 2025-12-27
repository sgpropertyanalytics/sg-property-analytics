import React, { useState, useRef, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bubble } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getDashboard } from '../../api/client';
import { KeyInsightBox, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  transformBeadsChartSeries,
  filterBedroomDatasets,
  formatPrice,
  logFetchDebug,
  assertKnownVersion,
} from '../../adapters';

ChartJS.register(LinearScale, PointElement, Tooltip, Legend);

/**
 * Beads on String Chart - Volume-Weighted Median Prices by Region & Bedroom
 *
 * Visualization:
 * - X-axis: Price in millions SGD
 * - Y-axis: Regions (CCR, RCR, OCR) as horizontal "strings"
 * - Bubbles: Size = transaction volume, Color = bedroom type
 *
 * This chart answers ONE question:
 * "How much are 1BR, 2BR, 3BR, 4BR, 5BR selling for in CCR, RCR, and OCR?"
 *
 * Features:
 * - Volume-weighted median (transaction value as weight)
 * - Default: Shows 2BR, 3BR, 4BR only
 * - Toggle: "Show all bedrooms" reveals 1BR and 5BR+
 * - Respects global sidebar filters
 */
export function BeadsChart({ height = 300 }) {
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();
  const [showAllBedrooms, setShowAllBedrooms] = useState(false);
  const chartRef = useRef(null);

  // Data fetching with useAbortableQuery
  const { data: chartData, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Use dashboard endpoint with beads_chart panel
      // excludeLocationDrill: true - This chart shows all regions, not affected by drill
      const params = buildApiParams(
        { panels: 'beads_chart' },
        { excludeLocationDrill: true }
      );

      const response = await getDashboard(params, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/dashboard');

      const responseData = response.data || {};
      const apiData = responseData.data || {};

      // Debug logging (dev only)
      logFetchDebug('BeadsChart', {
        endpoint: '/api/dashboard?panels=beads_chart',
        response: responseData,
        rowCount: apiData.beads_chart?.length || 0,
      });

      // Use adapter for transformation
      return transformBeadsChartSeries(apiData.beads_chart);
    },
    [debouncedFilterKey],
    {
      initialData: {
        datasets: [],
        stats: { priceRange: { min: 0, max: 0 }, volumeRange: { min: 0, max: 0 }, totalTransactions: 0 },
      },
    }
  );

  // Filter datasets based on toggle state
  const visibleData = useMemo(() => {
    if (showAllBedrooms) return chartData;
    return filterBedroomDatasets(chartData, [2, 3, 4]);
  }, [chartData, showAllBedrooms]);

  // Check if we have data
  const hasData = visibleData?.datasets?.length > 0;
  const { stats } = chartData;

  // Chart.js configuration
  const options = useMemo(
    () => ({
      ...baseChartJsOptions,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            font: { size: 11 },
            color: '#213448',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(33, 52, 72, 0.95)',
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 11 },
          padding: 12,
          cornerRadius: 6,
          callbacks: {
            title: (context) => {
              const raw = context[0]?.raw?._raw;
              if (!raw) return '';
              return `${raw.region} - ${raw.bedroom === 5 ? '5BR+' : `${raw.bedroom}BR`}`;
            },
            label: (context) => {
              const raw = context.raw?._raw;
              if (!raw) return '';
              return [
                `Median Price: ${formatPrice(raw.volumeWeightedMedian)}`,
                `Transactions: ${raw.transactionCount.toLocaleString()}`,
                `Total Value: ${formatPrice(raw.totalValue)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Volume-Weighted Median Price (Millions SGD)',
            font: { size: 11, weight: '500' },
            color: '#547792',
          },
          ticks: {
            callback: (value) => `$${value}M`,
            color: '#547792',
            font: { size: 10 },
          },
          grid: {
            color: 'rgba(148, 180, 193, 0.2)',
          },
          min: 0,
          // Add padding to max to prevent bubbles from being cut off
          suggestedMax: stats?.priceRange?.max
            ? Math.ceil((stats.priceRange.max / 1000000) * 1.15)
            : 10,
        },
        y: {
          type: 'linear',
          min: -0.5,
          max: 2.5,
          reverse: false,
          title: {
            display: false,
          },
          ticks: {
            stepSize: 1,
            callback: (value) => {
              const labels = ['CCR', 'RCR', 'OCR'];
              return labels[value] || '';
            },
            color: (context) => {
              // Color-code region labels
              const colors = ['#213448', '#547792', '#94B4C1'];
              return colors[context.tick.value] || '#547792';
            },
            font: { size: 12, weight: 'bold' },
          },
          grid: {
            display: true,
            color: (context) => {
              // Horizontal "strings" - slightly more visible
              const colors = [
                'rgba(33, 52, 72, 0.3)',
                'rgba(84, 119, 146, 0.3)',
                'rgba(148, 180, 193, 0.3)',
              ];
              return colors[context.tick.value] || 'rgba(148, 180, 193, 0.2)';
            },
            lineWidth: 2,
          },
        },
      },
    }),
    [stats?.priceRange?.max]
  );

  // Card height calculation (chart + header + footer)
  const cardHeight = height + 130;

  return (
    <QueryState
      loading={loading}
      error={error}
      onRetry={refetch}
      empty={!hasData && !loading}
      emptyMessage="No transaction data available for the selected filters"
      skeleton="bar"
      height={height}
    >
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#213448]">
                Price by Region & Bedroom
              </h3>
              <p className="text-xs text-[#547792] mt-0.5">
                Volume-weighted median prices
              </p>
            </div>
            <button
              onClick={() => setShowAllBedrooms(!showAllBedrooms)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                showAllBedrooms
                  ? 'bg-[#213448] text-white border-[#213448]'
                  : 'bg-white text-[#547792] border-[#94B4C1] hover:bg-[#EAE0CF]/50'
              }`}
            >
              {showAllBedrooms ? 'Show 2-4BR only' : 'Show all bedrooms'}
            </button>
          </div>
        </div>

        {/* Insight Box */}
        <div className="shrink-0 px-3 pt-2">
          <KeyInsightBox title="How to Read" variant="info" compact>
            Bubble size = transaction volume. Position = volume-weighted median
            price.
          </KeyInsightBox>
        </div>

        {/* Chart */}
        <ChartSlot>
          <Bubble ref={chartRef} data={visibleData} options={options} />
        </ChartSlot>

        {/* Footer */}
        <div className="shrink-0 h-9 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between text-xs text-[#547792]">
          <span>
            {stats?.totalTransactions?.toLocaleString() || 0} transactions
          </span>
          {stats?.priceRange?.min > 0 && stats?.priceRange?.max > 0 && (
            <span>
              Range: {formatPrice(stats.priceRange.min)} -{' '}
              {formatPrice(stats.priceRange.max)}
            </span>
          )}
        </div>
      </div>
    </QueryState>
  );
}

export default BeadsChart;
