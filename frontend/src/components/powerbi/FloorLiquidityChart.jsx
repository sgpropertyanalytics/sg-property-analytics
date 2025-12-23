import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import {
  FLOOR_LEVEL_LABELS,
  getFloorLevelIndex,
} from '../../constants';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

/**
 * Floor Liquidity-Adjusted Price Curve
 *
 * "Where price is real, not imagined."
 *
 * Visual encoding:
 * - CONFIDENCE: Solid/dashed/hidden line + point size + bar opacity
 * - PRICE RANGE: P25-P75 shaded band (narrow=consensus, wide=risk)
 * - PREMIUM: Explicit % labels above each point
 * - LIQUIDITY CLIFF: Annotated warning where volume collapses
 */
export function FloorLiquidityChart({ height = 400, bedroom, segment }) {
  const { buildApiParams, filters } = usePowerBIFilters();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // No longer using confidence thresholds for visual encoding

  // Fetch floor level data
  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad.current) {
        setLoading(true);
      } else {
        setUpdating(true);
      }
      setError(null);

      try {
        const params = buildApiParams({
          group_by: 'floor_level',
          metrics: 'count,median_psf_actual,psf_25th,psf_75th,avg_psf'
        });

        if (bedroom) params.bedroom = bedroom;
        if (segment) params.segment = segment;

        const response = await getAggregate(params);
        const rawData = response.data.data || [];

        const sortedData = rawData
          .filter(d => d.floor_level && d.floor_level !== 'Unknown')
          .sort((a, b) => getFloorLevelIndex(a.floor_level) - getFloorLevelIndex(b.floor_level));

        setData(sortedData);
        isInitialLoad.current = false;
      } catch (err) {
        console.error('Error fetching floor level data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setUpdating(false);
      }
    };

    fetchData();
  }, [buildApiParams, filters, bedroom, segment]);

  // Calculate baseline for premium calculation
  const baselinePSF = useMemo(() => {
    const lowFloor = data.find(d => d.floor_level === 'Low');
    return lowFloor?.median_psf_actual || lowFloor?.avg_psf || 0;
  }, [data]);

  // Calculate premiums
  const premiums = useMemo(() => {
    if (!baselinePSF) return data.map(() => 0);
    return data.map(d => {
      const psf = d.median_psf_actual || d.avg_psf || 0;
      return ((psf - baselinePSF) / baselinePSF) * 100;
    });
  }, [data, baselinePSF]);


  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#547792]">Loading floor analysis...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-[#547792]">No floor level data available for current filters</div>
        </div>
      </div>
    );
  }

  // Prepare data arrays
  const labels = data.map(d => FLOOR_LEVEL_LABELS[d.floor_level] || d.floor_level);
  const counts = data.map(d => d.count || 0);
  const medianPSFs = data.map(d => d.median_psf_actual || d.avg_psf || null);
  const psf25ths = data.map(d => d.psf_25th || null);
  const psf75ths = data.map(d => d.psf_75th || null);

  // Calculate ranges and stats
  const maxCount = Math.max(...counts);
  const maxPSF = Math.max(...medianPSFs.filter(v => v !== null));
  const minPSF = Math.min(...psf25ths.filter(v => v !== null));
  const totalTransactions = counts.reduce((a, b) => a + b, 0);

  // Simple volume bar colors
  const volumeBarColor = 'rgba(84, 119, 146, 0.5)';
  const volumeBarBorder = 'rgba(84, 119, 146, 0.8)';

  // Chart data
  const chartData = {
    labels,
    datasets: [
      // Volume bars
      {
        type: 'bar',
        label: 'Transaction Volume',
        data: counts,
        backgroundColor: volumeBarColor,
        borderColor: volumeBarBorder,
        borderWidth: 1,
        yAxisID: 'yVolume',
        order: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
      },
      // P75 upper bound (fills down to P25)
      {
        type: 'line',
        label: 'P75 (Upper)',
        data: psf75ths,
        borderColor: 'rgba(84, 119, 146, 0.5)',
        backgroundColor: 'rgba(84, 119, 146, 0.15)',
        borderWidth: 1,
        pointRadius: 0,
        fill: '+1',
        yAxisID: 'yPSF',
        order: 3,
        tension: 0.2,
      },
      // P25 lower bound
      {
        type: 'line',
        label: 'P25 (Lower)',
        data: psf25ths,
        borderColor: 'rgba(84, 119, 146, 0.5)',
        backgroundColor: 'transparent',
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        yAxisID: 'yPSF',
        order: 3,
        tension: 0.2,
      },
      // Median PSF line - clean and simple
      {
        type: 'line',
        label: 'Median PSF',
        data: medianPSFs,
        borderColor: '#213448',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#213448',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        fill: false,
        yAxisID: 'yPSF',
        order: 1,
        tension: 0.2,
      },
    ],
  };

  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(33, 52, 72, 0.97)',
        titleColor: '#EAE0CF',
        bodyColor: '#EAE0CF',
        borderColor: 'rgba(148, 180, 193, 0.4)',
        borderWidth: 1,
        padding: 16,
        displayColors: false,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        callbacks: {
          title: (items) => {
            const i = items[0]?.dataIndex;
            if (i === undefined) return '';
            return `${data[i]?.floor_level} Floor`;
          },
          label: () => '',
          afterBody: (items) => {
            const i = items[0]?.dataIndex;
            if (i === undefined) return [];

            const d = data[i];
            const premium = premiums[i];
            const bandWidth = (d.psf_75th || 0) - (d.psf_25th || 0);

            return [
              '',
              `Median PSF: $${Math.round(d.median_psf_actual || d.avg_psf || 0).toLocaleString()}`,
              `Premium vs Low: ${premium >= 0 ? '+' : ''}${premium.toFixed(1)}%`,
              '',
              `P25: $${Math.round(d.psf_25th || 0).toLocaleString()}`,
              `P75: $${Math.round(d.psf_75th || 0).toLocaleString()}`,
              `Spread: $${Math.round(bandWidth).toLocaleString()}`,
              '',
              `Transactions: ${d.count.toLocaleString()}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#547792',
          font: { size: 10, weight: 'bold' },
          maxRotation: 0,
        },
      },
      yPSF: {
        type: 'linear',
        position: 'left',
        // Round to nice intervals (e.g., 500, 1000, 1500, 2000)
        min: minPSF ? Math.floor(minPSF / 500) * 500 : undefined,
        max: maxPSF ? Math.ceil(maxPSF / 500) * 500 : undefined,
        grid: { color: 'rgba(148, 180, 193, 0.15)' },
        ticks: {
          color: '#213448',
          font: { weight: 'bold' },
          stepSize: 500,
          callback: (v) => `$${v.toLocaleString()}`,
        },
        title: {
          display: true,
          text: 'Median PSF ($)',
          color: '#213448',
          font: { size: 12, weight: 'bold' },
        },
      },
      yVolume: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: maxCount * 1.3,
        grid: { display: false },
        ticks: {
          color: '#94B4C1',
          callback: (v) => v.toLocaleString(),
        },
        title: {
          display: true,
          text: 'Volume',
          color: '#94B4C1',
          font: { size: 12 },
        },
      },
    },
  };

  // Summary stats
  const avgPremiumPerTier = premiums.length > 1
    ? (premiums[premiums.length - 1] - premiums[0]) / (premiums.length - 1)
    : 0;
  const highestPremiumTier = data[premiums.indexOf(Math.max(...premiums))]?.floor_level;
  const mostLiquidTier = data[counts.indexOf(Math.max(...counts))]?.floor_level;

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden flex flex-col transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`} style={{ minHeight: height }}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#94B4C1]/30 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-lg text-[#213448]">Floor Liquidity-Adjusted Price Curve</h3>
              {updating && (
                <div className="w-4 h-4 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <p className="text-sm text-[#547792] mt-0.5">
              Where price is real, not imagined
            </p>
          </div>
        </div>
      </div>

      {/* Simple Legend */}
      <div className="px-6 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20 shrink-0">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[#213448]" />
            <span className="text-[#213448] font-medium">Median PSF</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-3 bg-[#547792]/15 border border-[#547792]/50 rounded" />
            <span className="text-[#547792]">P25–P75 Range</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-[#547792]/50 border border-[#547792]/80 rounded" />
            <span className="text-[#547792]">Volume</span>
          </div>
        </div>
      </div>

      {/* Premium Pills Row */}
      <div className="px-6 py-2 border-b border-[#94B4C1]/20 bg-[#213448]/5 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-[#547792] uppercase tracking-wide shrink-0">Premium vs Low:</span>
          {data.map((d, i) => {
            const premium = premiums[i];
            const bgColor = premium > 0
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-50 text-gray-600 border-gray-200';

            return (
              <div
                key={d.floor_level}
                className={`px-2 py-1 rounded border text-xs font-mono shrink-0 ${bgColor}`}
              >
                <span className="font-semibold">{d.floor_level}</span>
                <span className="ml-1">
                  {premium >= 0 ? '+' : ''}{premium.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>


      {/* Chart */}
      <div className="flex-1 p-4 min-h-0">
        <Chart ref={chartRef} type="bar" data={chartData} options={options} />
      </div>

      {/* Footer Stats */}
      <div className="px-6 py-3 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[#94B4C1]">Total Transactions:</span>
              <span className="text-[#213448] font-bold">{totalTransactions.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-[#94B4C1]/30 pl-4">
              <span className="text-[#94B4C1]">Premium Gradient:</span>
              <span className={`font-bold ${avgPremiumPerTier >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {avgPremiumPerTier >= 0 ? '+' : ''}{avgPremiumPerTier.toFixed(1)}%/tier
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#94B4C1]">Most Active:</span>
              <span className="text-[#213448] font-bold">{mostLiquidTier}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[#94B4C1]">
            <span>Hover for details</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FloorLiquidityChart;
