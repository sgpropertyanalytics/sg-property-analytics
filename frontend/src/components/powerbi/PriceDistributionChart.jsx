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
import { getAggregate } from '../../api/client';
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
 * Price Distribution Chart - Histogram
 *
 * X-axis: PSF Bands ($500-600, $600-700, ...)
 * Y-axis: Transaction Count
 *
 * Supports:
 * - Cross-filtering: clicking a bar filters to that PSF range
 * - Shows price spread and common price points
 */
export function PriceDistributionChart({ onCrossFilter, onDrillThrough, height = 300, bucketSize = 200 }) {
  const { buildApiParams, crossFilter, applyCrossFilter, setPsfRange } = usePowerBIFilters();
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);

  // Fetch data - we need individual PSF values to bucket
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get data grouped by PSF to create histogram
        // Since we can't get raw values easily, we'll request aggregated data
        // and manually bucket by PSF ranges
        const params = buildApiParams({
          group_by: 'month,district', // Get granular data
          metrics: 'count,median_psf,min_psf,max_psf'
        });
        const response = await getAggregate(params);
        setRawData(response.data.data || []);
      } catch (err) {
        console.error('Error fetching price distribution data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [buildApiParams]);

  // Create histogram buckets from the data
  const bucketedData = useMemo(() => {
    if (!rawData.length) return [];

    // Get PSF range from data
    const allPsfs = rawData.flatMap(d => [d.min_psf, d.max_psf, d.median_psf]).filter(Boolean);
    if (allPsfs.length === 0) return [];

    const minPsf = Math.floor(Math.min(...allPsfs) / bucketSize) * bucketSize;
    const maxPsf = Math.ceil(Math.max(...allPsfs) / bucketSize) * bucketSize;

    // Create buckets
    const buckets = [];
    for (let start = minPsf; start < maxPsf; start += bucketSize) {
      buckets.push({
        start,
        end: start + bucketSize,
        label: `$${start.toLocaleString()}-${(start + bucketSize).toLocaleString()}`,
        count: 0,
      });
    }

    // Assign counts to buckets based on median PSF
    rawData.forEach(item => {
      const psf = item.median_psf;
      const count = item.count || 0;
      if (psf) {
        const bucketIndex = Math.floor((psf - minPsf) / bucketSize);
        if (bucketIndex >= 0 && bucketIndex < buckets.length) {
          buckets[bucketIndex].count += count;
        }
      }
    });

    // Filter out empty buckets at edges
    let startIdx = 0;
    let endIdx = buckets.length - 1;
    while (startIdx < buckets.length && buckets[startIdx].count === 0) startIdx++;
    while (endIdx >= 0 && buckets[endIdx].count === 0) endIdx--;

    return buckets.slice(startIdx, endIdx + 1);
  }, [rawData, bucketSize]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedBucket = bucketedData[index];
      if (clickedBucket) {
        // Apply PSF range filter
        if (onCrossFilter) {
          onCrossFilter('price', 'psf_range', `${clickedBucket.start}-${clickedBucket.end}`);
        }
        // Apply to sidebar filter
        setPsfRange(clickedBucket.start, clickedBucket.end);
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-slate-500">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (bucketedData.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-slate-500">No data available</div>
        </div>
      </div>
    );
  }

  const labels = bucketedData.map(b => b.label);
  const counts = bucketedData.map(b => b.count);

  // Calculate statistics
  const totalCount = counts.reduce((sum, c) => sum + c, 0);
  const maxCount = Math.max(...counts);
  const modeIndex = counts.indexOf(maxCount);
  const modeBucket = bucketedData[modeIndex];

  // Determine color gradient based on count
  const maxValue = Math.max(...counts);
  const getBarColor = (count, alpha = 0.8) => {
    const intensity = 0.3 + (count / maxValue) * 0.7;
    return `rgba(79, 129, 189, ${alpha * intensity})`;
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
            const bucket = bucketedData[items[0].dataIndex];
            return `PSF: $${bucket.start.toLocaleString()} - $${bucket.end.toLocaleString()}`;
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
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Price Distribution</h3>
          <DrillButtons hierarchyType="price" />
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-slate-500">
            PSF distribution (${bucketSize} buckets)
          </p>
          <div className="text-xs text-slate-600">
            Mode: {modeBucket?.label || 'N/A'}
          </div>
        </div>
      </div>
      <div className="p-4" style={{ height }}>
        <Bar ref={chartRef} data={chartData} options={options} />
      </div>
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex justify-between">
        <span>Total: {totalCount.toLocaleString()} transactions</span>
        <span>Click a bar to filter by PSF range</span>
      </div>
    </div>
  );
}

export default PriceDistributionChart;
