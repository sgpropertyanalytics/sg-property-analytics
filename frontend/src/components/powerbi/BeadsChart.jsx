import React, { useRef, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  BubbleController,
  Tooltip,
  Legend,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Bubble } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getDashboard } from '../../api/client';
import { ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  transformBeadsChartSeries,
  formatPrice,
  logFetchDebug,
  assertKnownVersion,
} from '../../adapters';

ChartJS.register(LinearScale, PointElement, BubbleController, Tooltip, Legend, annotationPlugin);

// Region colors for strings and labels (outside component to avoid dependency issues)
const REGION_COLORS = {
  CCR: '#213448', // Navy
  RCR: '#547792', // Blue
  OCR: '#94B4C1', // Sky
};

/**
 * Beads on String Chart - Volume-Weighted Median Prices by Region & Bedroom
 *
 * Visualization (TRUE "Beads on String"):
 * - X-axis: Price in millions SGD
 * - Y-axis: Regions (CCR, RCR, OCR) as categorical labels
 * - Horizontal "strings": Lines connecting min to max price per region
 * - Bubbles ("beads"): Size = transaction volume, Color = bedroom type
 * - White borders on bubbles for overlap management
 *
 * This chart answers ONE question:
 * "How much are 1BR, 2BR, 3BR, 4BR, 5BR selling for in CCR, RCR, and OCR?"
 */
export function BeadsChart({ height = 300 }) {
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();
  const chartRef = useRef(null);

  // Data fetching with useAbortableQuery
  const { data: chartData, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams(
        { panels: 'beads_chart' },
        { excludeLocationDrill: true }
      );

      const response = await getDashboard(params, { signal });
      assertKnownVersion(response.data, '/api/dashboard');

      const responseData = response.data || {};
      const apiData = responseData.data || {};

      logFetchDebug('BeadsChart', {
        endpoint: '/api/dashboard?panels=beads_chart',
        response: responseData,
        rowCount: apiData.beads_chart?.length || 0,
      });

      return transformBeadsChartSeries(apiData.beads_chart);
    },
    [debouncedFilterKey],
    {
      initialData: {
        datasets: [],
        stats: { priceRange: { min: 0, max: 0 }, volumeRange: { min: 0, max: 0 }, totalTransactions: 0 },
        stringRanges: { CCR: { min: 0, max: 0 }, RCR: { min: 0, max: 0 }, OCR: { min: 0, max: 0 } },
      },
    }
  );

  const hasData = chartData?.datasets?.length > 0;
  const { stats, stringRanges } = chartData;

  // Build annotation lines for the "strings"
  const stringAnnotations = useMemo(() => {
    if (!stringRanges) return {};

    const annotations = {};
    const regions = ['CCR', 'RCR', 'OCR'];

    regions.forEach((region, idx) => {
      const range = stringRanges[region];
      if (range && range.min > 0 && range.max > 0) {
        annotations[`string_${region}`] = {
          type: 'line',
          yMin: idx,
          yMax: idx,
          xMin: range.min / 1000000,
          xMax: range.max / 1000000,
          borderColor: REGION_COLORS[region],
          borderWidth: 3,
          borderDash: [],
          z: 0, // Behind the bubbles
        };
      }
    });

    return annotations;
  }, [stringRanges]);

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
        annotation: {
          annotations: stringAnnotations,
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Volume-Weighted Median Price ($ Millions)',
            font: { size: 11, weight: '500' },
            color: '#547792',
          },
          ticks: {
            callback: (value) => `$${value}M`,
            color: '#547792',
            font: { size: 10 },
          },
          grid: {
            display: false, // Remove vertical grid lines (distracting)
          },
          min: 0,
          suggestedMax: stats?.priceRange?.max
            ? Math.ceil((stats.priceRange.max / 1000000) * 1.2)
            : 10,
        },
        y: {
          type: 'linear',
          min: -0.5,
          max: 2.5,
          reverse: false,
          ticks: {
            stepSize: 1,
            autoSkip: false,
            includeBounds: false,
            callback: (value) => {
              // Only show labels at integer positions (0=CCR, 1=RCR, 2=OCR)
              if (value === 0) return 'CCR';
              if (value === 1) return 'RCR';
              if (value === 2) return 'OCR';
              return '';
            },
            color: (context) => {
              const value = context.tick.value;
              if (value === 0) return REGION_COLORS.CCR;
              if (value === 1) return REGION_COLORS.RCR;
              if (value === 2) return REGION_COLORS.OCR;
              return '#547792';
            },
            font: { size: 13, weight: 'bold' },
          },
          grid: {
            display: false, // We use annotation lines instead
          },
        },
      },
    }),
    [stats?.priceRange?.max, stringAnnotations]
  );

  const cardHeight = height + 100;

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
          <h3 className="font-semibold text-[#213448]">
            Price by Region & Bedroom
          </h3>
          <p className="text-xs text-[#547792] mt-0.5">
            Bubble size = volume • Position = median price
          </p>
        </div>

        {/* Chart */}
        <ChartSlot>
          <Bubble ref={chartRef} data={chartData} options={options} />
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
