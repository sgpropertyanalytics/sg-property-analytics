import React, { useEffect, useState, useRef, useMemo } from 'react';
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
import { KeyInsightBox, PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';

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
export function PriceDistributionChart({ height = 300, numBins = 20 }) {
  const { buildApiParams, highlight } = usePowerBIFilters();
  const [histogramData, setHistogramData] = useState({ bins: [], stats: {}, tail: {} });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [showFullRange, setShowFullRange] = useState(false);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Fetch server-side computed histogram
  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad.current) {
        setLoading(true);
      } else {
        setUpdating(true);
      }
      setError(null);
      try {
        // Use dashboard endpoint with price_histogram panel
        // excludeLocationDrill: true - Price Distribution should NOT be affected by
        // location drill (Power BI best practice: Drill ≠ Filter, drill is visual-local)
        const params = buildApiParams({
          panels: 'price_histogram',
          histogram_bins: numBins,
          // Only send show_full_range when true (backend defaults to false)
          ...(showFullRange && { show_full_range: 'true' })
        }, { excludeLocationDrill: true });

        // Skip cache when toggling to ensure fresh data
        const response = await getDashboard(params, { skipCache: showFullRange });
        const responseData = response.data || {};
        const data = responseData.data || {};

        // Handle both old format (array) and new format (object with bins/stats/tail)
        const rawHistogram = data.price_histogram;
        let priceHistogram;

        if (Array.isArray(rawHistogram)) {
          // Old format: price_histogram is array of bins directly
          priceHistogram = { bins: rawHistogram, stats: {}, tail: {} };
        } else if (rawHistogram && typeof rawHistogram === 'object') {
          // New format: price_histogram has bins, stats, tail
          priceHistogram = {
            bins: rawHistogram.bins || [],
            stats: rawHistogram.stats || {},
            tail: rawHistogram.tail || {}
          };
        } else {
          priceHistogram = { bins: [], stats: {}, tail: {} };
        }

        console.log('PriceDistribution response:', { rawHistogram, priceHistogram });

        setHistogramData(priceHistogram);
        isInitialLoad.current = false;
      } catch (err) {
        console.error('Error fetching price distribution data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setUpdating(false);
      }
    };
    fetchData();
  }, [buildApiParams, numBins, highlight, showFullRange]);

  // Helper to format price labels (e.g., $1.2M, $800K)
  const formatPrice = (value) => {
    if (value == null) return '-';
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  // Convert server histogram data to chart format
  const bucketedData = useMemo(() => {
    const bins = histogramData.bins || [];
    if (!bins.length) return { buckets: [], bucketSize: 0 };

    const buckets = bins.map(h => ({
      start: h.bin_start,
      end: h.bin_end,
      label: `${formatPrice(h.bin_start)}-${formatPrice(h.bin_end)}`,
      count: h.count
    }));

    const bucketSize = buckets.length > 0 ? (buckets[0].end - buckets[0].start) : 0;

    return { buckets, bucketSize };
  }, [histogramData.bins]);

  const { stats, tail } = histogramData;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-[#547792]">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (bucketedData.buckets.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-[#547792]">No data available</div>
        </div>
      </div>
    );
  }

  const { buckets, bucketSize } = bucketedData;
  const labels = buckets.map(b => b.label);
  const counts = buckets.map(b => b.count);

  // Calculate display statistics
  const displayCount = counts.reduce((sum, c) => sum + c, 0);
  const maxCount = Math.max(...counts, 0);
  const modeIndex = counts.length > 0 ? counts.indexOf(maxCount) : -1;
  const modeBucket = modeIndex >= 0 ? buckets[modeIndex] : null;

  // Price range from histogram bins
  const minPrice = buckets.length > 0 ? buckets[0].start : 0;
  const maxPrice = buckets.length > 0 ? buckets[buckets.length - 1].end : 0;

  // Helper to find which bin index a price value falls into
  const findBinIndex = (price) => {
    if (!price || buckets.length === 0) return -1;
    for (let i = 0; i < buckets.length; i++) {
      if (price >= buckets[i].start && price <= buckets[i].end) {
        return i;
      }
    }
    // If price is beyond the last bin, return the last index
    if (price > buckets[buckets.length - 1].end) {
      return buckets.length - 1;
    }
    return 0;
  };

  // Calculate bin indices for median, Q1, Q3
  const medianBinIndex = findBinIndex(stats?.median);
  const q1BinIndex = findBinIndex(stats?.p25);
  const q3BinIndex = findBinIndex(stats?.p75);

  // Debug logging for annotations
  console.log('Price Distribution Annotations Debug:', {
    stats,
    median: stats?.median,
    p25: stats?.p25,
    p75: stats?.p75,
    medianBinIndex,
    q1BinIndex,
    q3BinIndex,
    bucketsLength: buckets.length,
    firstBucket: buckets[0],
    lastBucket: buckets[buckets.length - 1]
  });

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

  console.log('Final annotations object:', annotations);

  const options = {
    ...baseChartJsOptions,
    // NO onClick - histogram is for context, not filtering
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            const bucket = buckets[items[0].dataIndex];
            return `Price: ${formatPrice(bucket.start)} - ${formatPrice(bucket.end)}`;
          },
          label: (context) => {
            const count = context.parsed.y;
            const pct = displayCount > 0 ? ((count / displayCount) * 100).toFixed(1) : 0;
            return [`Transactions: ${count.toLocaleString()}`, `Share: ${pct}%`];
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
          text: 'Transaction Count',
        },
        ticks: {
          callback: (value) => value.toLocaleString(),
        },
      },
    },
  };

  // Card layout contract: flex column with fixed total height
  // Header/Note/Footer are shrink-0, chart slot is flex-1 min-h-0
  const cardHeight = height + 190; // height prop for chart + ~190px for header(with stats)/note/footer

  return (
    <div
      className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}
      style={{ height: cardHeight }}
    >
      {/* Header - shrink-0 */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[#213448]">Price Distribution</h3>
            {updating && (
              <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
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

        {/* Stats row - Key price metrics */}
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {stats?.median && (
            <div className="shrink-0 bg-[#213448]/5 rounded px-2.5 py-1">
              <span className="text-[10px] text-[#547792] uppercase tracking-wide">Median</span>
              <div className="text-sm font-semibold text-[#213448]">{formatPrice(stats.median)}</div>
            </div>
          )}
          {stats?.p25 && stats?.p75 && (
            <div className="shrink-0 bg-[#213448]/5 rounded px-2.5 py-1">
              <span className="text-[10px] text-[#547792] uppercase tracking-wide">Q1–Q3</span>
              <div className="text-sm font-semibold text-[#213448]">
                {formatPrice(stats.p25)} – {formatPrice(stats.p75)}
              </div>
            </div>
          )}
          {stats?.iqr && (
            <div className="shrink-0 bg-[#213448]/5 rounded px-2.5 py-1">
              <span className="text-[10px] text-[#547792] uppercase tracking-wide">IQR</span>
              <div className="text-sm font-semibold text-[#213448]">{formatPrice(stats.iqr)}</div>
            </div>
          )}
          {modeBucket && (
            <div className="shrink-0 bg-[#213448]/5 rounded px-2.5 py-1">
              <span className="text-[10px] text-[#547792] uppercase tracking-wide">Mode</span>
              <div className="text-sm font-semibold text-[#213448]">{modeBucket.label}</div>
            </div>
          )}
        </div>
      </div>

      {/* How to Interpret - shrink-0 */}
      <div className="shrink-0">
        <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <div><span className="font-semibold text-[#213448]">Median</span> — The typical transaction price.</div>
            <div><span className="font-semibold text-[#213448]">Q1–Q3</span> — Where the middle 50% of homes sell.</div>
            <div><span className="font-semibold text-[#213448]">IQR</span> — How wide prices vary within the market.</div>
            <div><span className="font-semibold text-[#213448]">Mode</span> — The most common price range.</div>
          </div>
        </KeyInsightBox>
      </div>

      {/* Chart slot - flex-1 min-h-0 with h-full w-full inner wrapper */}
      <ChartSlot>
        <PreviewChartOverlay chartRef={chartRef}>
          <Bar key={showFullRange ? 'full' : 'capped'} ref={chartRef} data={chartData} options={options} />
        </PreviewChartOverlay>
      </ChartSlot>

      {/* Footer - fixed height h-11 for consistent alignment */}
      <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
        <span className="truncate">
          {displayCount.toLocaleString()} transactions
          {!showFullRange && tail?.pct > 0 && (
            <span className="ml-1 text-amber-600">• Top {tail.pct}% hidden</span>
          )}
        </span>
        <span className="shrink-0 text-[#94B4C1]">
          {formatPrice(minPrice)} – {formatPrice(maxPrice)} ({buckets.length} bins)
        </span>
      </div>
    </div>
  );
}

export default PriceDistributionChart;
