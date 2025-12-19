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
import { getDashboard } from '../../api/client';
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
 * Price Distribution Chart - Histogram of Transaction Prices
 *
 * X-axis: Total Price Bands ($1M-1.2M, $1.2M-1.4M, ...)
 * Y-axis: Transaction Count
 *
 * Uses SERVER-SIDE histogram computation for optimal performance.
 * The /api/dashboard endpoint computes bins in SQL, returning only
 * aggregated bucket data instead of 100K+ individual transactions.
 */
export function PriceDistributionChart({ onCrossFilter, onDrillThrough, height = 300, numBins = 20 }) {
  const { buildApiParams, crossFilter, applyCrossFilter } = usePowerBIFilters();
  const [histogramData, setHistogramData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Fetch server-side computed histogram (much faster than downloading all transactions)
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
        // Server computes bins in SQL - returns only ~20 data points instead of 100K rows
        // excludeLocationDrill: true - Price Distribution should NOT be affected by
        // location drill (Power BI best practice: Drill ≠ Filter, drill is visual-local)
        const params = buildApiParams({
          panels: 'price_histogram,summary',
          histogram_bins: numBins
        }, { excludeLocationDrill: true });
        console.log('PriceDistribution API params:', params);
        const response = await getDashboard(params);
        const responseData = response.data || {};
        const data = responseData.data || {};
        const histogram = data.price_histogram || [];
        const summary = data.summary || {};

        console.log('PriceDistribution API response:', {
          bins: histogram.length,
          total_records: summary.total_count,
          cache_hit: responseData.meta?.cache_hit
        });

        setHistogramData(histogram);
        setTotalCount(summary.total_count || histogram.reduce((sum, b) => sum + b.count, 0));
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
  }, [buildApiParams, numBins]);

  // Helper to format price labels (e.g., $1.2M, $800K)
  const formatPriceLabel = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  // Convert server histogram data to chart format
  const bucketedData = useMemo(() => {
    if (!histogramData.length) return { buckets: [], bucketSize: 0 };

    // Server returns: { bin, bin_start, bin_end, count }
    const buckets = histogramData.map(h => ({
      start: h.bin_start,
      end: h.bin_end,
      label: `${formatPriceLabel(h.bin_start)}-${formatPriceLabel(h.bin_end)}`,
      count: h.count
    }));

    // Calculate bucket size from first bin
    const bucketSize = buckets.length > 0 ? (buckets[0].end - buckets[0].start) : 0;

    return { buckets, bucketSize };
  }, [histogramData]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedBucket = bucketedData.buckets[index];
      if (clickedBucket) {
        // Apply price range cross-filter directly via context
        applyCrossFilter('price', 'price_range', `${clickedBucket.start}-${clickedBucket.end}`);
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

  // Calculate statistics from server-computed histogram
  const displayCount = counts.reduce((sum, c) => sum + c, 0);
  const maxCount = Math.max(...counts, 0);
  const modeIndex = counts.length > 0 ? counts.indexOf(maxCount) : -1;
  const modeBucket = modeIndex >= 0 ? buckets[modeIndex] : null;

  // Price range from histogram bins
  const minPrice = buckets.length > 0 ? buckets[0].start : 0;
  const maxPrice = buckets.length > 0 ? buckets[buckets.length - 1].end : 0;

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
            const pct = displayCount > 0 ? ((count / displayCount) * 100).toFixed(1) : 0;
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
        <span>
          Total: {(totalCount || displayCount).toLocaleString()} transactions
        </span>
        <span>Click a bar to filter by price range</span>
      </div>
    </div>
  );
}

export default PriceDistributionChart;
