import React, { useState, useRef, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Bar } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getDashboard } from '../../api/client';
import { KeyInsightBox, PreviewChartOverlay, ChartSlot, InlineCard, InlineCardRow } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  transformDistributionSeries,
  formatPrice,
  formatPriceRange,
  findBinIndex,
  logFetchDebug,
  assertKnownVersion,
} from '../../adapters';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin
);

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
export function PriceDistributionChart({ height = 300, numBins = 20, saleType = null }) {
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();
  const [showFullRange, setShowFullRange] = useState(false);
  const chartRef = useRef(null);

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data: histogramData, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Use dashboard endpoint with price_histogram panel
      // excludeLocationDrill: true - Price Distribution should NOT be affected by
      // location drill (Power BI best practice: Drill ≠ Filter, drill is visual-local)
      // saleType is passed from page level - see CLAUDE.md "Business Logic Enforcement"
      const params = buildApiParams({
        panels: 'price_histogram',
        histogram_bins: numBins,
        ...(saleType && { sale_type: saleType }),
        // Only send show_full_range when true (backend defaults to false)
        ...(showFullRange && { show_full_range: 'true' })
      }, { excludeLocationDrill: true });

      // Skip cache when toggling to ensure fresh data
      const response = await getDashboard(params, { skipCache: showFullRange, signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/dashboard');

      const responseData = response.data || {};
      const apiData = responseData.data || {};

      // Debug logging (dev only)
      logFetchDebug('PriceDistributionChart', {
        endpoint: '/api/dashboard?panels=price_histogram',
        timeGrain: null,
        response: responseData,
        rowCount: apiData.price_histogram?.bins?.length || 0,
      });

      // Use adapter for transformation - handles legacy vs new format
      return transformDistributionSeries(apiData.price_histogram);
    },
    [debouncedFilterKey, numBins, showFullRange, saleType],
    { initialData: { bins: [], stats: {}, tail: {}, totalCount: 0 }, keepPreviousData: true }
  );

  // Extract transformed data
  const { bins, stats, tail, totalCount } = histogramData;

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
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: 10,
          },
        },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Observation Count',
        },
        ticks: {
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
    <QueryState loading={loading} error={error} onRetry={refetch} empty={!bins || bins.length === 0} skeleton="bar" height={350}>
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
      {/* Header - shrink-0 */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
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
    </QueryState>
  );
}

export default PriceDistributionChart;
