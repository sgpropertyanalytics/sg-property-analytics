import React, { useRef, useMemo } from 'react';
import { useGatedAbortableQuery, useDebugOverlay, QueryStatus } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
// Chart.js components registered globally in chartSetup.js
import { Bubble } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilter';
import { getDashboard } from '../../api/client';
import { KeyInsightBox, ChartSlot } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { REGIONS } from '../../constants';
import {
  transformBeadsChartSeries,
  formatPrice,
  logFetchDebug,
  assertKnownVersion,
} from '../../adapters';
import { niceMaxMillion } from '../../utils/niceAxisMax';

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
export const BeadsChart = React.memo(function BeadsChart({
  height = 300,
  saleType = null,
  sharedData = null,
  sharedStatus = 'idle',
}) {
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();
  const chartRef = useRef(null);
  const { wrapApiCall, DebugOverlay, debugInfo } = useDebugOverlay('BeadsChart');

  const useShared = sharedData != null;

  // Data fetching with useGatedAbortableQuery - gates on appReady
  const { data: chartData, status, error, refetch } = useGatedAbortableQuery(
    async (signal) => {
      // saleType is passed from page level - see CLAUDE.md "Business Logic Enforcement"
      // excludeOwnDimension: 'segment' - this chart shows all regions, so ignore segment filter
      const params = buildApiParams(
        { panels: 'beads_chart', ...(saleType && { sale_type: saleType }) },
        { excludeLocationDrill: true, excludeOwnDimension: 'segment' }
      );

      const response = await wrapApiCall(
        '/api/dashboard?panels=beads_chart',
        params,
        () => getDashboard(params, { signal, priority: 'medium' })
      );
      // apiClient interceptor unwraps envelope, so response.data IS the inner data
      const apiData = response.data || {};
      assertKnownVersion(apiData, '/api/dashboard');

      // DEBUG: Log raw API data and transformed result
      const rawBeadsData = apiData.beads_chart;
      console.log('[BeadsChart] Raw API beads_chart data:', rawBeadsData);
      console.log('[BeadsChart] Sample row:', rawBeadsData?.[0]);

      const transformed = transformBeadsChartSeries(rawBeadsData);
      console.log('[BeadsChart] Transformed data:', {
        datasetCount: transformed.datasets?.length,
        datasets: transformed.datasets?.map(ds => ({
          label: ds.label,
          pointCount: ds.data?.length,
          samplePoint: ds.data?.[0],
        })),
        stats: transformed.stats,
        stringRanges: transformed.stringRanges,
      });

      logFetchDebug('BeadsChart', {
        endpoint: '/api/dashboard?panels=beads_chart',
        response: apiData,
        rowCount: rawBeadsData?.length || 0,
      });

      return transformed;
    },
    [debouncedFilterKey, saleType],
    {
      initialData: {
        datasets: [],
        stats: { priceRange: { min: 0, max: 0 }, volumeRange: { min: 0, max: 0 }, totalTransactions: 0 },
        stringRanges: { CCR: { min: 0, max: 0 }, RCR: { min: 0, max: 0 }, OCR: { min: 0, max: 0 } },
      },
      enabled: !useShared,
      keepPreviousData: true,
    }
  );

  const resolvedData = useShared ? transformBeadsChartSeries(sharedData) : chartData;
  // Use parent's status directly when using shared data
  const resolvedStatus = useShared ? sharedStatus : status;

  const hasData = resolvedData?.datasets?.length > 0;
  const { stats, stringRanges } = resolvedData;

  // Build annotation lines for the "strings" and row separators
  const stringAnnotations = useMemo(() => {
    if (!stringRanges) return {};

    const annotations = {};

    // "String" lines connecting min-max price per region
    REGIONS.forEach((region, idx) => {
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

    // Faint alternating background bands for regions
    annotations.band_ccr = {
      type: 'box',
      yMin: -0.5,
      yMax: 0.5,
      backgroundColor: 'rgba(33, 52, 72, 0.04)', // Faint navy
      borderWidth: 0,
      z: -2, // Behind everything
    };
    annotations.band_rcr = {
      type: 'box',
      yMin: 0.5,
      yMax: 1.5,
      backgroundColor: 'transparent', // Alternate: no fill
      borderWidth: 0,
      z: -2,
    };
    annotations.band_ocr = {
      type: 'box',
      yMin: 1.5,
      yMax: 2.5,
      backgroundColor: 'rgba(33, 52, 72, 0.04)', // Faint navy
      borderWidth: 0,
      z: -2,
    };

    // Subtle separators between region rows (at y=0.5 and y=1.5)
    annotations.separator_ccr_rcr = {
      type: 'line',
      yMin: 0.5,
      yMax: 0.5,
      borderColor: 'rgba(148, 180, 193, 0.3)', // Light sky color
      borderWidth: 1,
      borderDash: [4, 4],
      z: -1, // Behind bubbles but above bands
    };
    annotations.separator_rcr_ocr = {
      type: 'line',
      yMin: 1.5,
      yMax: 1.5,
      borderColor: 'rgba(148, 180, 193, 0.3)', // Light sky color
      borderWidth: 1,
      borderDash: [4, 4],
      z: -1,
    };

    return annotations;
  }, [stringRanges]);

  // Chart.js configuration - layout.padding aligns plot area with sibling charts
  const options = useMemo(
    () => ({
      ...baseChartJsOptions,
      layout: {
        padding: {
          top: 8,
          right: 16,
          bottom: 8,
          left: 8,
        },
      },
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
              return `${raw.region} - ${raw.bedroom === 5 ? '5BR' : `${raw.bedroom}BR`}`;
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
            ...CHART_AXIS_DEFAULTS.title,
          },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            stepSize: 0.5, // $500k intervals
            callback: (value) => {
              // Show as $500K, $1M, $1.5M, $2M, etc.
              if (value === 0) return '$0';
              if (value < 1) return `$${value * 1000}K`;
              if (value % 1 === 0) return `$${value}M`;
              return `$${value}M`;
            },
          },
          grid: {
            display: false, // Remove vertical grid lines (distracting)
          },
          min: 0,
          // Nice max: human-readable boundary (INV-11)
          max: stats?.priceRange?.max
            ? niceMaxMillion(stats.priceRange.max / 1000000)
            : 4,
        },
        y: {
          type: 'linear',
          min: -0.5,
          max: 2.5,
          reverse: false,
          // Force ticks at exactly 0, 1, 2 (CCR, RCR, OCR positions)
          afterBuildTicks: (axis) => {
            axis.ticks = [
              { value: 0 },
              { value: 1 },
              { value: 2 },
            ];
          },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            callback: (value) => {
              // Map numeric positions to region labels
              const labels = { 0: 'CCR', 1: 'RCR', 2: 'OCR' };
              return labels[value] || '';
            },
            font: { ...CHART_AXIS_DEFAULTS.ticks.font, size: 13 },
            padding: 8,
          },
          grid: {
            display: false, // We use annotation lines instead
          },
        },
      },
    }),
    [stats?.priceRange?.max, stringAnnotations]
  );

  // Match PriceDistributionChart card height: height + 190 for header/stats/note/footer
  const cardHeight = height + 190;

  return (
    <ChartFrame
      status={resolvedStatus}
      error={error}
      onRetry={refetch}
      empty={!hasData}
      skeleton="bar"
      height={350}
      debugInfo={debugInfo}
    >
      <div
        className="bg-card rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col relative"
        style={{ height: cardHeight }}
      >
        <DebugOverlay />
        {/* Header - shrink-0 */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="font-semibold text-[#213448]">
            Volume-Weighted Median Price by Region & Bedroom
          </h3>
          <p className="text-xs text-[#547792] mt-0.5">
            Bubble size = transaction count • Position = median price
          </p>
        </div>

        {/* How to Interpret - shrink-0 (matches PriceDistributionChart) */}
        <div className="shrink-0">
          <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
              <div><span className="font-semibold text-[#213448]">X-Position</span> — Volume-weighted median price.</div>
              <div><span className="font-semibold text-[#213448]">Bubble Size</span> — Number of transactions.</div>
              <div><span className="font-semibold text-[#213448]">Color</span> — Bedroom type (1BR to 5BR).</div>
              <div><span className="font-semibold text-[#213448]">String Line</span> — Price range for that region.</div>
            </div>
          </KeyInsightBox>
        </div>

        {/* Chart */}
        <ChartSlot>
          <Bubble ref={chartRef} data={resolvedData} options={options} />
        </ChartSlot>

        {/* Footer - h-11 matches PriceDistributionChart */}
        <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between text-xs text-[#547792]">
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
    </ChartFrame>
  );
});

export default BeadsChart;
