import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import apiClient from '../../api/client';
import { formatPrice, getBedroomLabelShort } from '../../constants';

ChartJS.register(
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

/**
 * Unit Size vs Price Chart - Scatter Plot
 *
 * X-axis: Transaction Price (Total Quantum) - aligns with Price Distribution
 * Y-axis: Unit Size (sqft) - "What you get for your money"
 * Color: Bedroom count (1BR-5BR+)
 *
 * Together with Price Distribution, answers the buyer question:
 * "What's my budget?" (Price Distribution) + "What can I get?" (This chart)
 *
 * Features:
 * - Stable sampling: same filters = same data points (no flickering)
 * - Refresh button: generates new random sample on demand
 * - Sampled data (2000 points) for performance
 * - Color-coded by bedroom type
 * - Opacity handles overplotting
 * - Tooltips show project details
 */
export function UnitSizeVsPriceChart({ height = 350 }) {
  const { buildApiParams, filters, highlight, crossFilter } = usePowerBIFilters();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ sample_size: 0, total_count: 0 });
  const [refreshSeed, setRefreshSeed] = useState(null); // null = stable sample, string = new sample
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Handle refresh button click - generates random seed for new sample
  const handleRefresh = () => {
    setRefreshSeed(Math.random().toString(36).substring(2, 10));
  };

  // Bedroom colors - matches BedroomMixChart palette
  const bedroomColors = {
    1: 'rgba(247, 190, 129, 0.7)', // Light orange
    2: 'rgba(79, 129, 189, 0.7)',  // Blue
    3: 'rgba(40, 82, 122, 0.7)',   // Dark blue
    4: 'rgba(17, 43, 60, 0.7)',    // Darkest navy
    5: 'rgba(155, 187, 89, 0.7)',  // Green
  };

  const bedroomBorderColors = {
    1: 'rgba(247, 190, 129, 1)',
    2: 'rgba(79, 129, 189, 1)',
    3: 'rgba(40, 82, 122, 1)',
    4: 'rgba(17, 43, 60, 1)',
    5: 'rgba(155, 187, 89, 1)',
  };

  // Fetch scatter data
  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad.current) {
        setLoading(true);
      } else {
        setUpdating(true);
      }
      setError(null);

      try {
        // Build params using global filter system
        const baseParams = buildApiParams({});

        // Build request params
        // - Without seed: stable sample (same filters = same data points)
        // - With seed: different sample (triggered by refresh button)
        const requestParams = {
          ...baseParams,
          sample_size: 2000,
        };
        if (refreshSeed) {
          requestParams.seed = refreshSeed;
        }

        // Call the scatter-sample endpoint
        const response = await apiClient.get('/scatter-sample', {
          params: requestParams
        });

        setData(response.data.data || []);
        setMeta(response.data.meta || { sample_size: 0, total_count: 0 });
        isInitialLoad.current = false;
      } catch (err) {
        console.error('Error fetching scatter data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setUpdating(false);
      }
    };

    fetchData();
  }, [buildApiParams, filters, highlight, crossFilter, refreshSeed]);

  // Transform data for Chart.js - group by bedroom
  const chartData = useMemo(() => {
    // Group points by bedroom count
    const groupedByBedroom = {};
    data.forEach(point => {
      const bedroom = Math.min(point.bedroom, 5); // Cap at 5+
      if (!groupedByBedroom[bedroom]) {
        groupedByBedroom[bedroom] = [];
      }
      groupedByBedroom[bedroom].push({
        x: point.price,
        y: point.area_sqft,
        district: point.district,
        bedroom: point.bedroom,
      });
    });

    // Create datasets for each bedroom type
    const datasets = Object.entries(groupedByBedroom)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([bedroom, points]) => ({
        label: getBedroomLabelShort(bedroom),
        data: points,
        backgroundColor: bedroomColors[bedroom] || 'rgba(128, 128, 128, 0.7)',
        borderColor: bedroomBorderColors[bedroom] || 'rgba(128, 128, 128, 1)',
        borderWidth: 1,
        pointRadius: 4,
        pointHoverRadius: 6,
      }));

    return { datasets };
  }, [data]);

  // Chart options
  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 12,
          font: { size: 11 },
          color: '#547792',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        titleColor: '#fff',
        bodyColor: '#EAE0CF',
        borderColor: '#94B4C1',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const point = items[0].raw;
            return `${point.district}`;
          },
          label: (context) => {
            const point = context.raw;
            return [
              `Price: ${formatPrice(point.x)}`,
              `Size: ${point.y.toLocaleString()} sqft`,
              `PSF: ${formatPrice(point.x / point.y)}/sqft`,
              `Type: ${getBedroomLabelShort(point.bedroom)}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: true,
          text: 'Transaction Price',
          color: '#547792',
          font: { size: 11, weight: 'bold' },
        },
        ticks: {
          color: '#547792',
          font: { size: 10 },
          callback: (value) => formatPrice(value),
          stepSize: 500000, // $0.5M intervals
        },
        grid: {
          color: 'rgba(148, 180, 193, 0.2)',
        },
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: 'Unit Size (sqft)',
          color: '#547792',
          font: { size: 11, weight: 'bold' },
        },
        ticks: {
          color: '#547792',
          font: { size: 10 },
          callback: (value) => value.toLocaleString(),
          maxTicksLimit: 8,
        },
        grid: {
          color: 'rgba(148, 180, 193, 0.2)',
        },
      },
    },
    interaction: {
      mode: 'nearest',
      intersect: true,
    },
  }), []);

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col" style={{ minHeight: height }}>
        <div className="p-4 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="text-sm font-semibold text-[#213448]">Unit Size vs Price</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[#547792]">Loading...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col" style={{ minHeight: height }}>
        <div className="p-4 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="text-sm font-semibold text-[#213448]">Unit Size vs Price</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col ${updating ? 'opacity-70' : ''}`} style={{ minHeight: height }}>
      {/* Header - fixed height, won't grow */}
      <div className="p-4 border-b border-[#94B4C1]/30 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#213448]">Unit Size vs Price</h3>
            <p className="text-xs text-[#547792] mt-0.5">
              What you get for your budget
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#94B4C1]">
              {meta.sample_size.toLocaleString()} sampled of {meta.total_count.toLocaleString()}
            </span>
            {/* Info icon with methodology tooltip */}
            <div className="relative group">
              <button
                className="p-1 rounded hover:bg-[#EAE0CF]/50 text-[#94B4C1] hover:text-[#547792] transition-colors"
                aria-label="Sampling methodology info"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {/* Tooltip */}
              <div className="absolute right-0 top-full mt-1 w-64 p-3 bg-[#213448] text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="font-semibold mb-1">Sampling Methodology</div>
                <ul className="space-y-1 text-[#EAE0CF]">
                  <li><span className="text-white">Stratified:</span> Equal representation per district</li>
                  <li><span className="text-white">Stable:</span> Same filters = same data points</li>
                  <li><span className="text-white">n=2,000:</span> ~2.2% margin of error at 95% confidence</li>
                </ul>
                <div className="mt-2 pt-2 border-t border-[#547792] text-[#94B4C1]">
                  Click refresh for a different sample
                </div>
                {/* Arrow */}
                <div className="absolute -top-1 right-3 w-2 h-2 bg-[#213448] rotate-45"></div>
              </div>
            </div>
            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={updating}
              className="p-1 rounded hover:bg-[#EAE0CF]/50 text-[#547792] hover:text-[#213448] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh sample"
            >
              <svg
                className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Chart - fills remaining space */}
      <div className="flex-1 p-4 min-h-0">
        <Scatter ref={chartRef} data={chartData} options={options} />
      </div>

      {/* Footer - fixed height, won't grow */}
      <div className="px-4 py-2 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 text-xs text-[#547792] shrink-0">
        <span>Hover for details | Colors show bedroom types | Stratified sample ensures all districts represented</span>
      </div>
    </div>
  );
}

export default UnitSizeVsPriceChart;
