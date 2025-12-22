import React, { useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

/**
 * Custom Chart.js plugin to draw a vertical marker line at the buyer's price.
 * This plugin draws directly on the canvas for pixel-perfect positioning.
 */
const buyerMarkerPlugin = {
  id: 'buyerMarker',
  afterDraw: (chart, args, options) => {
    if (!options.buyerPrice || !options.bins || options.bins.length === 0) return;

    const { ctx, chartArea } = chart;
    const { left, right, top, bottom } = chartArea;

    const bins = options.bins;
    const buyerPrice = options.buyerPrice;
    const minPrice = bins[0].start;
    const maxPrice = bins[bins.length - 1].end;
    const range = maxPrice - minPrice;

    if (range === 0) return;

    // Calculate x position based on price
    let xPosition = ((buyerPrice - minPrice) / range) * (right - left) + left;

    // Clamp to chart area with slight overflow indication
    const isOutsideLeft = xPosition < left;
    const isOutsideRight = xPosition > right;
    if (isOutsideLeft) xPosition = left - 5;
    if (isOutsideRight) xPosition = right + 5;

    // Draw the vertical dashed line
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#213448'; // Deep Navy
    ctx.lineWidth = 2;
    ctx.moveTo(xPosition, top);
    ctx.lineTo(xPosition, bottom);
    ctx.stroke();

    // Draw diamond marker at top
    const diamondSize = 6;
    ctx.setLineDash([]);
    ctx.fillStyle = '#213448';
    ctx.beginPath();
    ctx.moveTo(xPosition, top - diamondSize * 2);
    ctx.lineTo(xPosition + diamondSize, top - diamondSize);
    ctx.lineTo(xPosition, top);
    ctx.lineTo(xPosition - diamondSize, top - diamondSize);
    ctx.closePath();
    ctx.fill();

    // Add subtle shadow to diamond
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fill();

    ctx.restore();
  }
};

/**
 * Minimum comparable transactions threshold.
 * Below this number, we display a warning badge about limited data.
 */
const MIN_COMPARABLE_TRANSACTIONS = 30;

/**
 * Number of bins for the histogram.
 * Higher count provides more granular view of price distribution.
 */
const HISTOGRAM_BINS = 25;

/**
 * Computes the percentile rank of a buyer's price relative to comparable transactions.
 *
 * The percentile indicates what percentage of comparable transactions were priced
 * HIGHER than the buyer's price. This answers: "Did I pay less than most buyers?"
 *
 * Formula:
 *   percentile = (transactions_priced_higher / total_transactions) * 100
 *
 * Example:
 *   If buyer paid $1.5M and 75 out of 100 transactions were > $1.5M,
 *   then percentile = 75%, meaning "You paid less than 75% of comparable buyers"
 *
 * Edge cases:
 *   - If buyer price is the lowest: percentile = 100% (paid less than everyone)
 *   - If buyer price is the highest: percentile = 0% (paid more than everyone)
 *   - Prices equal to buyer price are NOT counted as "higher"
 *
 * @param {number} buyerPrice - The buyer's purchase price
 * @param {Array<{price: number}>} transactions - Array of comparable transaction objects
 * @returns {{
 *   percentile: number,        // 0-100, percentage of buyers who paid more
 *   higherCount: number,       // Count of transactions priced higher
 *   totalCount: number,        // Total comparable transactions
 *   isLimitedData: boolean,    // True if fewer than MIN_COMPARABLE_TRANSACTIONS
 *   isOutsideRange: boolean,   // True if buyer price is outside the price distribution
 *   position: 'below'|'within'|'above' // Where buyer price falls in distribution
 * }}
 */
export function computePricePercentile(buyerPrice, transactions) {
  // Handle empty or invalid data
  if (!transactions || transactions.length === 0) {
    return {
      percentile: 0,
      higherCount: 0,
      totalCount: 0,
      isLimitedData: true,
      isOutsideRange: true,
      position: 'within'
    };
  }

  const prices = transactions
    .map(t => t.price)
    .filter(p => typeof p === 'number' && !isNaN(p));

  const totalCount = prices.length;

  // Count transactions priced STRICTLY higher than buyer's price
  // Using strict inequality (>) because equal prices don't count as "higher"
  const higherCount = prices.filter(p => p > buyerPrice).length;

  // Calculate percentile: what % of buyers paid MORE than this buyer
  // This is a simple rank-based percentile (no interpolation needed)
  const percentile = totalCount > 0
    ? Math.round((higherCount / totalCount) * 100)
    : 0;

  // Determine if buyer price is outside the distribution range
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  let position = 'within';
  let isOutsideRange = false;

  if (buyerPrice < minPrice) {
    position = 'below';
    isOutsideRange = true;
  } else if (buyerPrice > maxPrice) {
    position = 'above';
    isOutsideRange = true;
  }

  // Clamp percentile to valid range (handles edge cases deterministically)
  const clampedPercentile = Math.max(0, Math.min(100, percentile));

  return {
    percentile: clampedPercentile,
    higherCount,
    totalCount,
    isLimitedData: totalCount < MIN_COMPARABLE_TRANSACTIONS,
    isOutsideRange,
    position
  };
}

/**
 * Creates histogram bins from transaction data.
 * Only creates bins that cover the actual data range (no empty trailing bins).
 *
 * @param {Array<{price: number}>} transactions - Transaction data
 * @param {number} numBins - Target number of histogram bins
 * @returns {Array<{start: number, end: number, count: number, label: string}>}
 */
function createHistogramBins(transactions, numBins = HISTOGRAM_BINS) {
  if (!transactions || transactions.length === 0) {
    return [];
  }

  const prices = transactions
    .map(t => t.price)
    .filter(p => typeof p === 'number' && !isNaN(p));

  if (prices.length === 0) return [];

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // Calculate range and bin size
  const range = maxPrice - minPrice || 1;
  const rawBinSize = range / numBins;

  // Round bin size to a nice number for stable display
  const roundedBinSize = rawBinSize > 100000
    ? Math.ceil(rawBinSize / 50000) * 50000  // Round to $50K for large ranges
    : Math.ceil(rawBinSize / 10000) * 10000; // Round to $10K for smaller ranges

  // Adjust min to align with rounded bin size
  const adjustedMin = Math.floor(minPrice / roundedBinSize) * roundedBinSize;

  // Calculate how many bins we actually need to cover the data
  const actualBinsNeeded = Math.ceil((maxPrice - adjustedMin) / roundedBinSize);

  const bins = [];
  for (let i = 0; i < actualBinsNeeded; i++) {
    const start = adjustedMin + (i * roundedBinSize);
    const end = start + roundedBinSize;
    // Include max price in the last bin (use <= for end)
    const isLastBin = i === actualBinsNeeded - 1;
    const count = prices.filter(p => p >= start && (isLastBin ? p <= end : p < end)).length;

    bins.push({
      start,
      end,
      count,
      label: formatPriceShort(start)
    });
  }

  return bins;
}

/**
 * Formats price as short label (e.g., $1.5M, $850K)
 */
function formatPriceShort(value) {
  if (value >= 1000000) {
    const millions = value / 1000000;
    return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  return `$${(value / 1000).toFixed(0)}K`;
}

/**
 * PriceDistributionHeroChart - Histogram showing price distribution with buyer's purchase marker
 *
 * This chart helps buyers instantly see where their purchase price falls relative
 * to comparable transactions. A prominent vertical marker and percentile annotation
 * communicate "position in the crowd" at a glance.
 *
 * Features:
 * - Histogram of comparable transaction prices
 * - Vertical marker line at buyer's price
 * - Percentile annotation (e.g., "You paid less than 73% of comparable buyers")
 * - Warning badge when data is limited (<30 transactions)
 * - Edge case handling for prices outside distribution
 * - Hover tooltips with detailed information
 *
 * @param {Object} props
 * @param {number} props.buyerPrice - The buyer's purchase price
 * @param {Array<{price: number}>} props.transactions - Comparable transaction data
 * @param {number} [props.height=280] - Chart height in pixels
 * @param {boolean} [props.loading=false] - Loading state
 * @param {Object} [props.activeFilters={}] - Currently active filters for subtitle context
 * @param {Function} [props.onBinClick] - Callback when a histogram bin is clicked
 * @param {Object} [props.selectedPriceRange] - Currently selected price range filter
 */
export function PriceDistributionHeroChart({
  buyerPrice,
  transactions = [],
  height = 280,
  loading = false,
  activeFilters = {},
  onBinClick,
  selectedPriceRange
}) {
  const chartRef = useRef(null);

  // Compute percentile statistics
  const stats = useMemo(() =>
    computePricePercentile(buyerPrice, transactions),
    [buyerPrice, transactions]
  );

  // Create histogram bins
  const bins = useMemo(() =>
    createHistogramBins(transactions, HISTOGRAM_BINS),
    [transactions]
  );

  // Find which bin the buyer price falls into (for highlighting)
  const buyerBinIndex = useMemo(() => {
    if (bins.length === 0) return -1;
    return bins.findIndex(bin => buyerPrice >= bin.start && buyerPrice < bin.end);
  }, [bins, buyerPrice]);

  // Find which bin is currently selected (filtered)
  const selectedBinIndex = useMemo(() => {
    if (!selectedPriceRange || bins.length === 0) return -1;
    return bins.findIndex(bin =>
      bin.start === selectedPriceRange.start && bin.end === selectedPriceRange.end
    );
  }, [bins, selectedPriceRange]);

  // Handle chart click - triggers bin filter
  const handleChartClick = (event) => {
    const chart = chartRef.current;
    if (!chart || !onBinClick) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedBin = bins[index];
      if (clickedBin) {
        onBinClick({ start: clickedBin.start, end: clickedBin.end });
      }
    }
  };

  // Generate chart data with color intensity based on count
  const chartData = useMemo(() => {
    if (bins.length === 0) return null;

    const maxCount = Math.max(...bins.map(b => b.count), 1);
    const labels = bins.map(b => b.label);
    const counts = bins.map(b => b.count);

    // Color gradient: higher bars get darker color
    // Selected bin gets accent color, buyer bin gets dark navy
    const backgroundColors = bins.map((bin, idx) => {
      const intensity = 0.3 + (bin.count / maxCount) * 0.5;

      // Selected bin (filtered) - highlight with accent color
      if (idx === selectedBinIndex) {
        return 'rgba(16, 185, 129, 0.8)'; // Emerald green for selected
      }
      // Buyer's price bin - dark navy
      if (idx === buyerBinIndex) {
        return `rgba(33, 52, 72, ${intensity + 0.2})`; // #213448 with extra opacity
      }
      return `rgba(84, 119, 146, ${intensity})`; // #547792
    });

    const borderColors = bins.map((bin, idx) => {
      if (idx === selectedBinIndex) {
        return 'rgba(16, 185, 129, 1)'; // Emerald border
      }
      if (idx === buyerBinIndex) {
        return 'rgba(33, 52, 72, 0.9)';
      }
      return 'rgba(84, 119, 146, 0.7)';
    });

    return {
      labels,
      datasets: [{
        label: 'Transactions',
        data: counts,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: selectedBinIndex >= 0 ? bins.map((_, idx) => idx === selectedBinIndex ? 2 : 1) : 1,
        barPercentage: 0.9,
        categoryPercentage: 0.95,
      }]
    };
  }, [bins, buyerBinIndex, selectedBinIndex]);

  // Chart.js options with custom tooltip and click handling
  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 300
    },
    onClick: onBinClick ? handleChartClick : undefined,
    onHover: (event, elements) => {
      // Change cursor to pointer when hovering over bars (if click is enabled)
      if (onBinClick) {
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        callbacks: {
          title: (items) => {
            const bin = bins[items[0].dataIndex];
            return `${formatPriceShort(bin.start)} - ${formatPriceShort(bin.end)}`;
          },
          label: (context) => {
            const count = context.parsed.y;
            const pct = stats.totalCount > 0
              ? ((count / stats.totalCount) * 100).toFixed(1)
              : 0;
            const lines = [
              `Transactions: ${count.toLocaleString()}`,
              `Share: ${pct}%`
            ];
            if (onBinClick) {
              lines.push('Click to filter table');
            }
            return lines;
          },
        },
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 10,
        cornerRadius: 4,
      },
      // Custom plugin configuration for buyer marker line
      buyerMarker: {
        buyerPrice,
        bins,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 45,
          minRotation: 0,
          font: {
            size: 10,
          },
          color: '#547792',
        },
        border: {
          display: false,
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(148, 180, 193, 0.2)',
        },
        ticks: {
          font: {
            size: 10,
          },
          color: '#547792',
          callback: (value) => value.toLocaleString(),
        },
        border: {
          display: false,
        },
        title: {
          display: true,
          text: 'Transactions',
          color: '#547792',
          font: {
            size: 11,
          }
        }
      },
    },
  }), [bins, stats.totalCount, buyerPrice, onBinClick]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#94B4C1]/30">
          <h3 className="font-semibold text-[#213448]">Price Distribution</h3>
        </div>
        <div className="p-4 flex items-center justify-center" style={{ height }}>
          <div className="flex items-center gap-2 text-[#547792]">
            <div className="w-4 h-4 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            <span>Loading distribution...</span>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (!transactions || transactions.length === 0 || !chartData) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#94B4C1]/30">
          <h3 className="font-semibold text-[#213448]">Price Distribution</h3>
        </div>
        <div className="p-4 flex items-center justify-center" style={{ height }}>
          <div className="text-center text-[#547792]">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">No comparable transactions to display</p>
          </div>
        </div>
      </div>
    );
  }

  // Determine annotation message based on percentile
  const getAnnotationMessage = () => {
    if (stats.isOutsideRange) {
      if (stats.position === 'below') {
        return 'Your price is below all comparable transactions';
      }
      return 'Your price is above all comparable transactions';
    }

    if (stats.percentile >= 50) {
      return `You paid less than ${stats.percentile}% of comparable buyers`;
    } else {
      // When percentile is low, flip the message
      const paidMoreThan = 100 - stats.percentile;
      return `You paid more than ${paidMoreThan}% of comparable buyers`;
    }
  };

  // Determine if this is a good deal (paid less than most)
  const isGoodDeal = stats.percentile >= 50;

  // Build filter context description
  const getFilterDescription = () => {
    const parts = [];

    if (activeFilters.bedroom) {
      parts.push(`${activeFilters.bedroom}BR`);
    }
    if (activeFilters.region) {
      parts.push(activeFilters.region);
    }
    if (activeFilters.district) {
      parts.push(`D${activeFilters.district}`);
    }
    if (activeFilters.tenure) {
      parts.push(activeFilters.tenure);
    }
    if (activeFilters.saleType) {
      parts.push(activeFilters.saleType);
    }
    if (activeFilters.leaseAge) {
      // Map lease age values to friendly labels
      const ageLabels = {
        '0-5': 'New / Recently TOP',
        '5-10': 'Young Resale',
        '10-20': 'Mature',
        '20+': 'Old'
      };
      parts.push(ageLabels[activeFilters.leaseAge] || activeFilters.leaseAge);
    }

    return parts.length > 0 ? parts.join(' · ') : 'All properties';
  };

  return (
    <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[#213448]">Price Distribution</h3>
            <p className="text-xs text-[#547792] mt-0.5">
              How your target price compares to {stats.totalCount.toLocaleString()} comparable transactions
            </p>
            <p className="text-xs text-[#547792]/70 mt-0.5">
              Filters: {getFilterDescription()}
              {onBinClick && (
                <span className="ml-2 text-[#547792]">• Click bars to filter table</span>
              )}
            </p>
          </div>

          {/* Limited data warning badge */}
          {stats.isLimitedData && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Limited comparable data</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart container - marker line drawn by Chart.js plugin */}
      <div className="p-4" style={{ height }}>
        <Bar
          ref={chartRef}
          data={chartData}
          options={options}
          plugins={[buyerMarkerPlugin]}
        />
      </div>

      {/* Annotation Footer */}
      <div className="px-4 py-3 bg-gradient-to-r from-[#EAE0CF]/40 to-[#EAE0CF]/20 border-t border-[#94B4C1]/30">
        <div className="flex items-center justify-between">
          {/* Percentile annotation - the key insight */}
          <div className="flex items-center gap-3">
            {/* Visual indicator */}
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
              isGoodDeal
                ? 'bg-emerald-100 text-emerald-600'
                : 'bg-amber-100 text-amber-600'
            }`}>
              {isGoodDeal ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              )}
            </div>

            {/* Text annotation */}
            <div>
              <p className={`font-semibold ${
                isGoodDeal ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {getAnnotationMessage()}
              </p>
              <p className="text-xs text-[#547792] mt-0.5">
                Your target: {formatPriceShort(buyerPrice)}
                {stats.isOutsideRange && (
                  <span className="ml-1 text-amber-600">(outside typical range)</span>
                )}
              </p>
            </div>
          </div>

          {/* Percentile badge */}
          <div className="text-right">
            <div className={`text-2xl font-bold ${
              isGoodDeal ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {stats.percentile}%
            </div>
            <div className="text-xs text-[#547792]">percentile rank</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PriceDistributionHeroChart;
