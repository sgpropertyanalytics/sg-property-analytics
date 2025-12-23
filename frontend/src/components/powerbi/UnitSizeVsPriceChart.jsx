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
import { KeyInsightBox } from '../ui';

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
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

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

        // Call the scatter-sample endpoint
        const response = await apiClient.get('/scatter-sample', {
          params: {
            ...baseParams,
            sample_size: 2000,
          }
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
  }, [buildApiParams, filters, highlight, crossFilter]);

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
          maxTicksLimit: 8,
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
      <div className="bg-white rounded-lg border border-[#94B4C1]/50" style={{ height: height + 120 }}>
        <div className="p-4 border-b border-[#94B4C1]/30">
          <h3 className="text-sm font-semibold text-[#213448]">Unit Size vs Price</h3>
        </div>
        <div className="flex items-center justify-center h-full">
          <div className="text-[#547792]">Loading...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50" style={{ height: height + 120 }}>
        <div className="p-4 border-b border-[#94B4C1]/30">
          <h3 className="text-sm font-semibold text-[#213448]">Unit Size vs Price</h3>
        </div>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 ${updating ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="p-4 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#213448]">Unit Size vs Price</h3>
            <p className="text-xs text-[#547792] mt-0.5">
              What you get for your budget
            </p>
          </div>
          <div className="text-xs text-[#94B4C1]">
            {meta.sample_size.toLocaleString()} of {meta.total_count.toLocaleString()} transactions
          </div>
        </div>
      </div>

      {/* How to Interpret - Static explanations */}
      <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <div><span className="font-semibold text-[#213448]">X-Axis</span> — Your budget (transaction price).</div>
          <div><span className="font-semibold text-[#213448]">Y-Axis</span> — What you get (unit size in sqft).</div>
          <div><span className="font-semibold text-[#213448]">Colors</span> — Bedroom types cluster in bands.</div>
          <div><span className="font-semibold text-[#213448]">Density</span> — More dots = popular price point.</div>
        </div>
      </KeyInsightBox>

      {/* Chart */}
      <div className="p-4" style={{ height }}>
        <Scatter ref={chartRef} data={chartData} options={options} />
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 text-xs text-[#547792]">
        <span>Hover for details | Colors show bedroom types | Sampled for performance</span>
      </div>
    </div>
  );
}

export default UnitSizeVsPriceChart;
