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
import { Bar } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getTransactionsList } from '../../api/client';
import { DrillButtons } from './DrillButtons';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

/**
 * Price Distribution Chart - Histogram of Individual Transaction Prices
 *
 * X-axis: Total Price Bands ($1M-1.2M, $1.2M-1.4M, ...)
 * Y-axis: Transaction Count
 *
 * Uses individual transaction prices for accurate distribution analysis.
 * Helps users understand if they overpaid or underpaid compared to others.
 *
 * Dynamic binning: Automatically calculates bin intervals to fit approximately
 * the specified number of bins based on the filtered data range.
 */
export function PriceDistributionChart({ onCrossFilter, onDrillThrough, height = 300, numBins = 30 }) {
  const { buildApiParams, crossFilter, applyCrossFilter } = usePowerBIFilters();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Fetch individual transaction data for accurate histogram
  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad.current) {
        setLoading(true);
      } else {
        setUpdating(true);
      }
      setError(null);
      try {
        // Get individual transactions with prices for accurate histogram
        // Higher limit ensures we capture the full distribution
        const params = buildApiParams({
          limit: 10000, // Get enough for comprehensive distribution
          sort_by: 'price',
          sort_order: 'asc'
        });
        const response = await getTransactionsList(params);
        setTransactions(response.data.transactions || []);
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
  }, [buildApiParams]);

  // Helper to format price labels (e.g., $1.2M, $800K)
  const formatPriceLabel = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  // Helper to round to a "nice" bucket size for readability
  // Uses CLOSEST nice number to maintain approximately the target number of bins
  const getNiceBucketSize = (rawSize) => {
    // Nice numbers for Singapore property prices (more granular options)
    const niceNumbers = [5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000, 200000, 250000, 500000, 1000000];

    // Find the closest nice number (not just next one up)
    let closest = niceNumbers[0];
    let minDiff = Math.abs(rawSize - closest);

    for (const nice of niceNumbers) {
      const diff = Math.abs(rawSize - nice);
      if (diff < minDiff) {
        minDiff = diff;
        closest = nice;
      }
    }

    // For very large ranges, round to nearest 500K or 1M
    if (rawSize > 1000000) {
      return Math.ceil(rawSize / 500000) * 500000;
    }

    return closest;
  };

  // Create histogram buckets from individual transaction prices
  const bucketedData = useMemo(() => {
    if (!transactions.length) return { buckets: [], bucketSize: 0 };

    // Get actual price range from individual transactions
    const prices = transactions.map(t => t.price).filter(p => p > 0);
    if (prices.length === 0) return { buckets: [], bucketSize: 0 };

    const dataMin = Math.min(...prices);
    const dataMax = Math.max(...prices);
    const range = dataMax - dataMin;

    // Calculate bucket size to fit exactly numBins
    const rawBucketSize = range / numBins;
    const bucketSize = getNiceBucketSize(rawBucketSize);

    // Adjust min/max to align with bucket boundaries
    const minPrice = Math.floor(dataMin / bucketSize) * bucketSize;
    const maxPrice = Math.ceil(dataMax / bucketSize) * bucketSize;

    // Create buckets
    const buckets = [];
    for (let start = minPrice; start < maxPrice; start += bucketSize) {
      buckets.push({
        start,
        end: start + bucketSize,
        label: `${formatPriceLabel(start)}-${formatPriceLabel(start + bucketSize)}`,
        count: 0,
      });
    }

    // Count individual transactions in each bucket
    prices.forEach(price => {
      const bucketIndex = Math.floor((price - minPrice) / bucketSize);
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].count += 1;
      }
    });

    // Filter out empty buckets at edges
    let startIdx = 0;
    let endIdx = buckets.length - 1;
    while (startIdx < buckets.length && buckets[startIdx].count === 0) startIdx++;
    while (endIdx >= 0 && buckets[endIdx].count === 0) endIdx--;

    return { buckets: buckets.slice(startIdx, endIdx + 1), bucketSize };
  }, [transactions, numBins]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedBucket = bucketedData.buckets[index];
      if (clickedBucket && onCrossFilter) {
        // Apply price range cross-filter
        onCrossFilter('price', 'price_range', `${clickedBucket.start}-${clickedBucket.end}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-[#547792]">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (bucketedData.buckets.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-[#547792]">No data available</div>
        </div>
      </div>
    );
  }

  const { buckets, bucketSize } = bucketedData;
  const labels = buckets.map(b => b.label);
  const counts = buckets.map(b => b.count);

  // Calculate statistics
  const totalCount = counts.reduce((sum, c) => sum + c, 0);
  const maxCount = Math.max(...counts);
  const modeIndex = counts.indexOf(maxCount);
  const modeBucket = buckets[modeIndex];

  // Calculate price statistics from actual transactions
  const prices = transactions.map(t => t.price).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  // Determine color gradient based on count using theme colors
  const maxValue = Math.max(...counts);
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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleClick,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            const bucket = buckets[items[0].dataIndex];
            return `Price: ${formatPriceLabel(bucket.start)} - ${formatPriceLabel(bucket.end)}`;
          },
          label: (context) => {
            const count = context.parsed.y;
            const pct = ((count / totalCount) * 100).toFixed(1);
            return [`Transactions: ${count.toLocaleString()}`, `Share: ${pct}%`];
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

  return (
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[#213448]">Price Distribution</h3>
            {updating && (
              <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <DrillButtons hierarchyType="price" />
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-[#547792]">
            {formatPriceLabel(minPrice)} - {formatPriceLabel(maxPrice)} ({buckets.length} bins @ {formatPriceLabel(bucketSize)})
          </p>
          <div className="text-xs text-[#213448]">
            Mode: {modeBucket?.label || 'N/A'}
          </div>
        </div>
      </div>
      <div className="p-4" style={{ height }}>
        <Bar ref={chartRef} data={chartData} options={options} />
      </div>
      <div className="px-4 py-2 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 text-xs text-[#547792] flex justify-between">
        <span>Total: {totalCount.toLocaleString()} transactions</span>
        <span>Click a bar to filter by price range</span>
      </div>
    </div>
  );
}

export default PriceDistributionChart;
