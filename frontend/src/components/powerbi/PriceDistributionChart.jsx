import React, { useState, useRef, useMemo } from 'react';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery, QueryStatus } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
// Chart.js components registered globally in chartSetup.js
import { Bar } from 'react-chartjs-2';
// Phase 3.2: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores';
import { getDashboard } from '../../api/client';
import { KeyInsightBox, PreviewChartOverlay, ChartSlot, InlineCard, InlineCardRow } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import {
  transformDistributionSeries,
  formatPrice,
  formatPriceRange,
  findBinIndex,
  logFetchDebug,
  assertKnownVersion,
} from '../../adapters';

/**
 * Price Distribution Chart - Histogram of Transaction Prices
 *
 * Best practices implemented:
 * - Shows P5-P95 range by default (luxury tail doesn't flatten signal)
 * - Toggle to show full range including luxury tail
 * - Displays median + IQR statistics
 * - NO cross-filter on click (histogram is contextual, not a filter tool)
 * - Clear note about hidden data percentage
 *
 * This chart answers ONE question: "Where do most transactions happen?"
 */
/**
 * @param {{
 *  height?: number,
 *  numBins?: number,
 *  saleType?: string | null,
 *  sharedData?: Record<string, any> | null,
 *  sharedStatus?: string,
 *  onDrillThrough?: (value: string) => void,
 * }} props
 */
function PriceDistributionChartBase({
  height = 300,
  numBins = 20,
  saleType = null,
  sharedData = null,
  sharedStatus = 'idle',
  staggerIndex = 0,
  onDrillThrough: _onDrillThrough,
}) {
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  const districts = filters.districts?.join(',') || '';

  const [showFullRange, setShowFullRange] = useState(false);
  const chartRef = useRef(null);

  const useShared = sharedData != null && !showFullRange;

  // Phase 4: Simplified data fetching - inline params, explicit query key
  const { data: histogramData, status, error, refetch } = useAppQuery(
    async (signal) => {
      // Inline params - no buildApiParams abstraction
      // Note: This chart doesn't filter by location drill (visual-local)
      const params = {
        panels: 'price_histogram',
        histogram_bins: numBins,
        timeframe,
        bedroom,
        // district excluded - histogram shows overall distribution
        ...(saleType && { sale_type: saleType }),
        // Only send show_full_range when true (backend defaults to false)
        ...(showFullRange && { show_full_range: 'true' }),
      };

      // Skip cache when toggling to ensure fresh data
      const response = await getDashboard(params, { skipCache: showFullRange, signal, priority: 'medium' });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/dashboard');

      // axios interceptor already unwraps envelope: response.data = { price_histogram, ... }
      const apiData = response.data || {};

      // Debug logging (dev only)
      logFetchDebug('PriceDistributionChart', {
        endpoint: '/api/dashboard?panels=price_histogram',
        timeGrain: null,
        response: apiData,
        rowCount: apiData.price_histogram?.bins?.length || 0,
      });

      // Use adapter for transformation - handles legacy vs new format
      return transformDistributionSeries(apiData.price_histogram);
    },
    // Explicit query key - TanStack handles cache deduplication
    ['price-distribution', timeframe, bedroom, numBins, showFullRange, saleType],
    { chartName: 'PriceDistributionChart', initialData: null, enabled: !useShared, keepPreviousData: true }
  );

  // Default fallback for when histogramData is null (initial load)
  const resolvedData = useShared ? transformDistributionSeries(sharedData) : (histogramData ?? { bins: [], stats: {}, tail: {}, totalCount: 0 });
  // Use parent's status directly when using shared data
  const resolvedStatus = useShared ? sharedStatus : status;

  // Extract transformed data
  const { bins, stats, tail, totalCount } = resolvedData;

  // Derive chart data from transformed bins
  const labels = bins.map(b => b.label);
  const counts = bins.map(b => b.count);

  // Calculate display statistics
  const displayCount = totalCount;
  const maxCount = Math.max(...counts, 0);
  const modeIndex = counts.length > 0 ? counts.indexOf(maxCount) : -1;
  const modeBucket = modeIndex >= 0 ? bins[modeIndex] : null;

  // Price range from histogram bins
  const minPrice = bins.length > 0 ? bins[0].start : 0;
  const maxPrice = bins.length > 0 ? bins[bins.length - 1].end : 0;

  // Calculate bin indices for median, Q1, Q3 using adapter helper
  const medianBinIndex = findBinIndex(bins, stats?.median);
  const q1BinIndex = findBinIndex(bins, stats?.p25);
  const q3BinIndex = findBinIndex(bins, stats?.p75);

  // Determine color gradient based on count using theme colors
  const maxValue = Math.max(...counts, 1);
  const getBarColor = (count, alpha = 0.8) => {
    const intensity = 0.3 + (count / maxValue) * 0.7;
    return `rgba(84, 119, 146, ${alpha * intensity})`;  // #547792
  };

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Transaction Count',
        data: counts,
        backgroundColor: counts.map(c => getBarColor(c)),
        borderColor: counts.map(c => getBarColor(c, 1)),
        borderWidth: 1,
      },
    ],
  };

  // Build annotations for median line and IQR band
  const annotations = {};

  // IQR band (Q1-Q3) - shaded background
  if (q1BinIndex >= 0 && q3BinIndex >= 0) {
    annotations.iqrBand = {
      type: 'box',
      xMin: q1BinIndex - 0.5,
      xMax: q3BinIndex + 0.5,
      backgroundColor: 'rgba(33, 52, 72, 0.08)',  // Light navy background
      borderColor: 'rgba(33, 52, 72, 0.2)',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        display: true,
        content: 'IQR',
        position: 'start',
        color: 'rgba(33, 52, 72, 0.5)',
        font: { size: 9, weight: 'normal' },
      },
    };
  }

  // Median line - solid vertical line
  if (medianBinIndex >= 0) {
    annotations.medianLine = {
      type: 'line',
      xMin: medianBinIndex,
      xMax: medianBinIndex,
      borderColor: 'rgba(33, 52, 72, 0.8)',  // Dark navy
      borderWidth: 2,
      borderDash: [],  // Solid line
      label: {
        display: true,
        content: `Median: ${formatPrice(stats?.median)}`,
        position: 'start',
        backgroundColor: 'rgba(33, 52, 72, 0.9)',
        color: '#fff',
        font: { size: 10, weight: 'bold' },
        padding: { x: 6, y: 3 },
        borderRadius: 3,
      },
    };
  }

  const options = useMemo(() => ({
    ...baseChartJsOptions,
    // layout.padding aligns plot area with sibling charts
    layout: {
      padding: {
        top: 8,
        right: 16,
        bottom: 8,
        left: 8,
      },
    },
    // NO onClick - histogram is for context, not filtering
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            const bin = bins[items[0].dataIndex];
            return `Price: ${formatPrice(bin.start)} - ${formatPrice(bin.end)}`;
          },
          label: (context) => {
            const count = context.parsed.y;
            const pct = displayCount > 0 ? ((count / displayCount) * 100).toFixed(1) : 0;
            return [`Observations: ${count.toLocaleString()}`, `Share: ${pct}%`];
          },
        },
      },
      annotation: {
        annotations,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Observation Count',
          ...CHART_AXIS_DEFAULTS.title,
        },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => value.toLocaleString(),
        },
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [bins, displayCount, medianBinIndex, q1BinIndex, q3BinIndex]);

  // Card layout contract: flex column with fixed total height
  // Header/Note/Footer are shrink-0, chart slot is flex-1 min-h-0
  const cardHeight = height + 190; // height prop for chart + ~190px for header(with stats)/note/footer

  return (
    <ChartFrame
      status={resolvedStatus}
      isFiltering={false}
      error={error}
      onRetry={refetch}
      empty={!bins || bins.length === 0}
      skeleton="bar"
      height={350}
      staggerIndex={staggerIndex}
    >
      <div
        className="weapon-card hud-corner weapon-shadow overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
      {/* Header - shrink-0 */}
      <div className="px-4 py-3 border-b border-mono-muted shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[#213448]">Price Distribution</h3>
          {/* Toggle for luxury tail */}
          <button
            onClick={() => setShowFullRange(!showFullRange)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              showFullRange
                ? 'bg-[#213448] text-white border-[#213448]'
                : 'bg-white text-[#547792] border-[#94B4C1] hover:bg-[#EAE0CF]/50'
            }`}
          >
            {showFullRange ? 'Hide luxury tail' : 'Show luxury tail'}
          </button>
        </div>

        {/* Stats row - Using standardized InlineCard components (compact size) */}
        <InlineCardRow compact className="mt-2">
          {stats?.median && (
            <InlineCard label="Median" value={formatPrice(stats.median)} size="compact" />
          )}
          {stats?.p25 && stats?.p75 && (
            <InlineCard label="Q1–Q3" value={formatPriceRange(stats.p25, stats.p75, { compact: true })} size="compact" />
          )}
          {stats?.iqr && (
            <InlineCard label="IQR" value={formatPrice(stats.iqr)} size="compact" />
          )}
          {modeBucket && (
            <InlineCard label="Mode" value={modeBucket.label} size="compact" />
          )}
        </InlineCardRow>
      </div>

      {/* How to Interpret - shrink-0 */}
      <div className="shrink-0">
        <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
            <div><span className="font-semibold text-[#213448]">Median</span> — The typical transaction price.</div>
            <div><span className="font-semibold text-[#213448]">Q1–Q3</span> — Where the middle 50% of homes sell.</div>
            <div><span className="font-semibold text-[#213448]">IQR</span> — How wide prices vary within the market.</div>
            <div><span className="font-semibold text-[#213448]">Mode</span> — The most common price range.</div>
          </div>
        </KeyInsightBox>
      </div>

      {/* Chart slot - Chart.js handles data updates efficiently without key remount */}
      <ChartSlot>
        <PreviewChartOverlay chartRef={chartRef}>
          <Bar ref={chartRef} data={chartData} options={options} />
        </PreviewChartOverlay>
      </ChartSlot>

      {/* Footer - fixed height h-11 for consistent alignment */}
      <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
        <span className="truncate min-w-0 flex-1">
          {displayCount.toLocaleString()} transactions
          {!showFullRange && tail?.pct > 0 && (
            <span className="ml-1 text-amber-600">• Top {tail.pct}% hidden</span>
          )}
        </span>
        <span className="shrink-0 text-[#94B4C1] hidden sm:block">
          {formatPrice(minPrice)} – {formatPrice(maxPrice)} ({bins.length} bins)
        </span>
      </div>
      </div>
    </ChartFrame>
  );
}

export const PriceDistributionChart = React.memo(PriceDistributionChartBase);

export default PriceDistributionChart;
