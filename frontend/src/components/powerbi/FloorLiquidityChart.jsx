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
  FLOOR_LEVELS,
  FLOOR_LEVEL_LABELS,
  getFloorLevelIndex,
  getFloorLevelColor,
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
 * A price-by-floor curve weighted by transaction volume.
 * - X-axis: Floor level tier
 * - Y-axis (left): Median PSF
 * - Y-axis (right): Transaction count (volume bars in background)
 * - Confidence band: P25-P75 range
 * - Line style: Solid (n≥10), Dashed (5≤n<10), Hidden (n<5)
 *
 * Kills three myths:
 * 1. "Higher floor = always worth more" → Flat/collapsing sections expose fake premiums
 * 2. "My floor is special" → Thin volume = weak market validation
 * 3. "That price is market price" → Only liquid prices are real prices
 */
export function FloorLiquidityChart({ height = 400, bedroom, segment }) {
  const { buildApiParams, filters } = usePowerBIFilters();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Minimum transaction count thresholds
  const MIN_CONFIDENT = 10;  // Solid line
  const MIN_DISPLAY = 5;     // Dashed line (below this, hide)

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

        // Apply local filters (these override global filters if provided)
        if (bedroom) {
          params.bedroom = bedroom;
        }
        if (segment) {
          params.segment = segment;
        }

        const response = await getAggregate(params);
        const rawData = response.data.data || [];

        // Sort by floor level order and filter out Unknown
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

  // Calculate baseline (Low floor) for premium calculation
  const baselinePSF = useMemo(() => {
    const lowFloor = data.find(d => d.floor_level === 'Low');
    return lowFloor?.median_psf_actual || lowFloor?.avg_psf || 0;
  }, [data]);

  // Calculate premium percentages
  const premiums = useMemo(() => {
    if (!baselinePSF) return data.map(() => 0);
    return data.map(d => {
      const psf = d.median_psf_actual || d.avg_psf || 0;
      return ((psf - baselinePSF) / baselinePSF) * 100;
    });
  }, [data, baselinePSF]);

  // Get confidence level for each floor tier
  const getConfidenceLevel = (count) => {
    if (count >= MIN_CONFIDENT) return 'high';
    if (count >= MIN_DISPLAY) return 'medium';
    return 'low';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
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
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-[#547792]">No floor level data available for current filters</div>
        </div>
      </div>
    );
  }

  // Prepare chart data - use full labels with floor ranges
  const labels = data.map(d => FLOOR_LEVEL_LABELS[d.floor_level] || d.floor_level);
  const counts = data.map(d => d.count || 0);
  const medianPSFs = data.map(d => d.median_psf_actual || d.avg_psf || null);
  const psf25ths = data.map(d => d.psf_25th || null);
  const psf75ths = data.map(d => d.psf_75th || null);

  // Calculate max values for axis scaling
  const maxCount = Math.max(...counts);
  const maxPSF = Math.max(...medianPSFs.filter(v => v !== null));
  const minPSF = Math.min(...psf25ths.filter(v => v !== null));

  // Colors based on confidence level
  const volumeBarColors = data.map(d => {
    const conf = getConfidenceLevel(d.count);
    if (conf === 'high') return 'rgba(84, 119, 146, 0.3)';   // Ocean Blue, visible
    if (conf === 'medium') return 'rgba(84, 119, 146, 0.15)'; // Faded
    return 'rgba(200, 200, 200, 0.1)';  // Very faded for low confidence
  });

  // Point colors based on floor level
  const pointColors = data.map(d => getFloorLevelColor(d.floor_level));

  // Build datasets
  const chartData = {
    labels,
    datasets: [
      // Volume bars (background)
      {
        type: 'bar',
        label: 'Transaction Volume',
        data: counts,
        backgroundColor: volumeBarColors,
        borderColor: volumeBarColors.map(c => c.replace(/[\d.]+\)$/, '0.5)')),
        borderWidth: 1,
        yAxisID: 'yVolume',
        order: 3,
        barPercentage: 0.8,
        categoryPercentage: 0.9,
      },
      // P25-P75 confidence band (area between lines)
      {
        type: 'line',
        label: 'P75 (Upper)',
        data: psf75ths,
        borderColor: 'rgba(148, 180, 193, 0.4)',
        backgroundColor: 'rgba(148, 180, 193, 0.15)',
        borderWidth: 1,
        borderDash: [2, 2],
        pointRadius: 0,
        fill: '+1', // Fill to next dataset
        yAxisID: 'yPSF',
        order: 2,
      },
      {
        type: 'line',
        label: 'P25 (Lower)',
        data: psf25ths,
        borderColor: 'rgba(148, 180, 193, 0.4)',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderDash: [2, 2],
        pointRadius: 0,
        fill: false,
        yAxisID: 'yPSF',
        order: 2,
      },
      // Median PSF line (main)
      {
        type: 'line',
        label: 'Median PSF',
        data: medianPSFs,
        borderColor: '#213448',
        backgroundColor: 'rgba(33, 52, 72, 0.1)',
        borderWidth: 3,
        pointRadius: 6,
        pointBackgroundColor: pointColors,
        pointBorderColor: '#213448',
        pointBorderWidth: 2,
        pointHoverRadius: 8,
        fill: false,
        yAxisID: 'yPSF',
        order: 1,
        tension: 0.1, // Slight curve
        // Segment styling based on confidence
        segment: {
          borderDash: ctx => {
            const index = ctx.p0DataIndex;
            const count = counts[index];
            const nextCount = counts[index + 1];
            // Dashed if either endpoint has low confidence
            if (count < MIN_CONFIDENT || nextCount < MIN_CONFIDENT) {
              return [6, 4];
            }
            return undefined; // Solid
          },
          borderColor: ctx => {
            const index = ctx.p0DataIndex;
            const count = counts[index];
            const nextCount = counts[index + 1];
            // Fade if low confidence
            if (count < MIN_DISPLAY || nextCount < MIN_DISPLAY) {
              return 'rgba(33, 52, 72, 0.3)';
            }
            if (count < MIN_CONFIDENT || nextCount < MIN_CONFIDENT) {
              return 'rgba(33, 52, 72, 0.7)';
            }
            return '#213448';
          },
        },
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false, // Custom legend below
      },
      tooltip: {
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        titleColor: '#EAE0CF',
        bodyColor: '#EAE0CF',
        borderColor: 'rgba(148, 180, 193, 0.3)',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          title: (items) => {
            const index = items[0]?.dataIndex;
            if (index === undefined) return '';
            const floorLevel = data[index]?.floor_level;
            return `Floor Level: ${floorLevel}`;
          },
          label: () => '', // Handled in afterBody
          afterBody: (items) => {
            const index = items[0]?.dataIndex;
            if (index === undefined) return [];

            const d = data[index];
            const premium = premiums[index];
            const conf = getConfidenceLevel(d.count);
            const confLabel = conf === 'high' ? 'High' : conf === 'medium' ? 'Medium' : 'Low';
            const confDots = conf === 'high' ? '●●●●●' : conf === 'medium' ? '●●●○○' : '●○○○○';

            const lines = [
              `─────────────────────`,
              `Median PSF:    $${Math.round(d.median_psf_actual || d.avg_psf || 0).toLocaleString()}`,
              `P25-P75:       $${Math.round(d.psf_25th || 0).toLocaleString()} – $${Math.round(d.psf_75th || 0).toLocaleString()}`,
              `─────────────────────`,
              `Transactions:  ${d.count.toLocaleString()}`,
              `Premium vs Low: ${premium >= 0 ? '+' : ''}${premium.toFixed(1)}%`,
              `─────────────────────`,
              `Confidence:    ${confDots} ${confLabel}`,
            ];

            if (conf === 'low') {
              lines.push(`⚠️ Thin volume - weak price signal`);
            }

            return lines;
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
          color: '#547792',
          font: { size: 11, weight: 'bold' },
        },
        title: {
          display: true,
          text: 'Floor Level',
          color: '#213448',
          font: { size: 12, weight: 'bold' },
        },
      },
      yPSF: {
        type: 'linear',
        position: 'left',
        min: minPSF ? Math.floor(minPSF * 0.9) : undefined,
        max: maxPSF ? Math.ceil(maxPSF * 1.05) : undefined,
        grid: {
          color: 'rgba(148, 180, 193, 0.2)',
        },
        ticks: {
          color: '#213448',
          callback: (value) => `$${value.toLocaleString()}`,
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
        max: maxCount * 1.2, // Leave room at top
        grid: {
          display: false,
        },
        ticks: {
          color: '#94B4C1',
          callback: (value) => value.toLocaleString(),
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

  // Calculate summary stats
  const totalTransactions = counts.reduce((a, b) => a + b, 0);
  const avgPremiumPerTier = premiums.length > 1
    ? (premiums[premiums.length - 1] - premiums[0]) / (premiums.length - 1)
    : 0;
  const highestPremiumTier = data[premiums.indexOf(Math.max(...premiums))]?.floor_level;
  const mostLiquidTier = data[counts.indexOf(Math.max(...counts))]?.floor_level;

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-lg text-[#213448]">Floor Liquidity-Adjusted Price Curve</h3>
              {updating && (
                <div className="w-4 h-4 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <p className="text-sm text-[#547792] mt-0.5">
              Where price is real, not imagined — weighted by transaction volume
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#213448]" />
              <span className="text-[#547792]">Confident (n≥10)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#213448] opacity-50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #213448 0, #213448 3px, transparent 3px, transparent 6px)' }} />
              <span className="text-[#547792]">Thin (n&lt;10)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4" style={{ height: height - 160 }}>
        <Chart ref={chartRef} type="bar" data={chartData} options={options} />
      </div>

      {/* Footer Stats */}
      <div className="px-6 py-3 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[#94B4C1]">Total Txns: </span>
              <span className="text-[#213448] font-semibold">{totalTransactions.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[#94B4C1]">Avg Premium/Tier: </span>
              <span className={`font-semibold ${avgPremiumPerTier >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {avgPremiumPerTier >= 0 ? '+' : ''}{avgPremiumPerTier.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-[#94B4C1]">Highest Premium: </span>
              <span className="text-[#213448] font-semibold">{highestPremiumTier}</span>
            </div>
            <div>
              <span className="text-[#94B4C1]">Most Liquid: </span>
              <span className="text-[#213448] font-semibold">{mostLiquidTier}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[#94B4C1]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Hover for details</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FloorLiquidityChart;
