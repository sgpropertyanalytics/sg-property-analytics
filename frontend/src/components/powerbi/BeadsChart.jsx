import React, { useRef, useMemo } from 'react';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery, useDebugOverlay, QueryStatus } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
// Chart.js components registered globally in chartSetup.js
import { Bubble } from 'react-chartjs-2';
// Phase 3.2: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores';
import { getDashboard } from '../../api/client';
import { KeyInsightBox, ChartSlot } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { REGIONS } from '../../constants';
import { REGION } from '../../constants/colors';
import {
  transformBeadsChartSeries,
  formatPrice,
  logFetchDebug,
  assertKnownVersion,
} from '../../adapters';
import { niceMaxMillion } from '../../utils/niceAxisMax';

// Region colors from centralized colors.js
const REGION_COLORS = REGION;

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
/**
 * @param {{
 *  height?: number,
 *  saleType?: string | null,
 *  sharedData?: Record<string, any> | null,
 *  sharedStatus?: string,
 * }} props
 */
function BeadsChartBase({
  height = 300,
  saleType = null,
  sharedData = null,
  sharedStatus = 'idle',
  staggerIndex = 0,
}) {
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  const districts = filters.districts?.join(',') || '';

  const chartRef = useRef(null);
  const { wrapApiCall, DebugOverlay, debugInfo } = useDebugOverlay('BeadsChart');

  const useShared = sharedData != null;

  // Phase 4: Simplified data fetching - inline params, explicit query key
  const { data: chartData, status, error, refetch } = useAppQuery(
    async (signal) => {
      // Inline params - no buildApiParams abstraction
      // Note: This chart shows all regions, so we don't filter by district/segment
      const params = {
        panels: 'beads_chart',
        timeframe,
        // bedroom excluded - this chart shows ALL bedroom types as separate bubbles
        ...(saleType && { sale_type: saleType }),
      };

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
      console.warn('[BeadsChart] Raw API beads_chart data:', rawBeadsData);
      console.warn('[BeadsChart] Sample row:', rawBeadsData?.[0]);

      const transformed = transformBeadsChartSeries(rawBeadsData);
      console.warn('[BeadsChart] Transformed data:', {
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
    // Explicit query key - TanStack handles cache deduplication
    ['beads-chart', timeframe, saleType],
    {
      chartName: 'BeadsChart',
      initialData: null,
      enabled: !useShared,
      keepPreviousData: true,
    }
  );

  // Default fallback for when data is null (initial load) - matches PriceDistributionChart pattern
  const defaultData = {
    datasets: [],
    stats: { priceRange: { min: 0, max: 0 }, volumeRange: { min: 0, max: 0 }, totalTransactions: 0 },
    stringRanges: { CCR: { min: 0, max: 0 }, RCR: { min: 0, max: 0 }, OCR: { min: 0, max: 0 } },
  };
  const resolvedData = (useShared ? transformBeadsChartSeries(sharedData) : chartData) ?? defaultData;
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
      backgroundColor: CHART_COLORS.navyDeepAlpha04, // Faint navy
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
      backgroundColor: CHART_COLORS.navyDeepAlpha04, // Faint navy
      borderWidth: 0,
      z: -2,
    };

    // Subtle separators between region rows (at y=0.5 and y=1.5)
    annotations.separator_ccr_rcr = {
      type: 'line',
      yMin: 0.5,
      yMax: 0.5,
      borderColor: CHART_COLORS.skyAlpha30, // Light sky color
      borderWidth: 1,
      borderDash: [4, 4],
      z: -1, // Behind bubbles but above bands
    };
    annotations.separator_rcr_ocr = {
      type: 'line',
      yMin: 1.5,
      yMax: 1.5,
      borderColor: CHART_COLORS.skyAlpha30, // Light sky color
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
            color: CHART_COLORS.navy,  // slate-900
          },
        },
        tooltip: {
          backgroundColor: CHART_COLORS.navyAlpha95,  // slate-900
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
      isFiltering={false}
      error={error}
      onRetry={refetch}
      empty={!hasData}
      skeleton="bar"
      height={350}
      staggerIndex={staggerIndex}
      debugInfo={debugInfo}
    >
      <div
        className="weapon-card hud-corner weapon-shadow overflow-hidden flex flex-col relative"
        style={{ height: cardHeight }}
      >
        <DebugOverlay />
        {/* Header - shrink-0 */}
        <div className="px-4 py-3 border-b border-mono-muted shrink-0">
          <h3 className="font-semibold text-brand-navy">
            Volume-Weighted Median Price by Region & Bedroom
          </h3>
          <p className="text-xs text-brand-blue mt-0.5">
            Bubble size = transaction count • Position = median price
          </p>
        </div>

        {/* How to Interpret - shrink-0 (matches PriceDistributionChart) */}
        <div className="shrink-0">
          <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
              <div><span className="font-semibold text-brand-navy">X-Position</span> — Volume-weighted median price.</div>
              <div><span className="font-semibold text-brand-navy">Bubble Size</span> — Number of transactions.</div>
              <div><span className="font-semibold text-brand-navy">Color</span> — Bedroom type (1BR to 5BR).</div>
              <div><span className="font-semibold text-brand-navy">String Line</span> — Price range for that region.</div>
            </div>
          </KeyInsightBox>
        </div>

        {/* Chart */}
        <ChartSlot>
          <Bubble ref={chartRef} data={resolvedData} options={options} />
        </ChartSlot>

        {/* Footer - h-11 matches PriceDistributionChart */}
        <div className="shrink-0 h-11 px-4 bg-brand-sand/30 border-t border-brand-sky/30 flex items-center justify-between text-xs text-brand-blue">
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
}

export const BeadsChart = React.memo(BeadsChartBase);

export default BeadsChart;
