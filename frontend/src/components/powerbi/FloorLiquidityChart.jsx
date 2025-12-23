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

  // Confidence thresholds
  const MIN_CONFIDENT = 10;
  const MIN_DISPLAY = 5;

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

  // Detect liquidity cliff (where volume drops >50% from previous)
  const liquidityCliffIndex = useMemo(() => {
    const counts = data.map(d => d.count || 0);
    for (let i = 1; i < counts.length; i++) {
      if (counts[i - 1] > 0 && counts[i] < counts[i - 1] * 0.5) {
        return i;
      }
    }
    return -1;
  }, [data]);

  // Get confidence level
  const getConfidence = (count) => {
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

  // Volume bar colors - EXPLICIT confidence encoding
  const volumeBarColors = data.map((d, i) => {
    const conf = getConfidence(d.count);
    const isCliff = i >= liquidityCliffIndex && liquidityCliffIndex >= 0;

    if (conf === 'high') return isCliff ? 'rgba(220, 38, 38, 0.4)' : 'rgba(84, 119, 146, 0.6)';
    if (conf === 'medium') return isCliff ? 'rgba(220, 38, 38, 0.25)' : 'rgba(84, 119, 146, 0.3)';
    return 'rgba(180, 180, 180, 0.2)';
  });

  const volumeBarBorders = data.map((d, i) => {
    const conf = getConfidence(d.count);
    const isCliff = i >= liquidityCliffIndex && liquidityCliffIndex >= 0;

    if (conf === 'high') return isCliff ? 'rgba(220, 38, 38, 0.8)' : 'rgba(84, 119, 146, 0.9)';
    if (conf === 'medium') return isCliff ? 'rgba(220, 38, 38, 0.5)' : 'rgba(84, 119, 146, 0.5)';
    return 'rgba(180, 180, 180, 0.4)';
  });

  // Point styling - EXPLICIT confidence encoding
  const pointRadii = data.map(d => {
    const conf = getConfidence(d.count);
    if (conf === 'high') return 10;
    if (conf === 'medium') return 7;
    return 4;
  });

  const pointStyles = data.map(d => {
    const conf = getConfidence(d.count);
    if (conf === 'high') return 'circle';
    if (conf === 'medium') return 'circle';
    return 'crossRot';
  });

  const pointBgColors = data.map((d, i) => {
    const conf = getConfidence(d.count);
    if (conf === 'high') return getFloorLevelColor(d.floor_level);
    if (conf === 'medium') return 'rgba(255, 255, 255, 0.8)';
    return 'rgba(180, 180, 180, 0.5)';
  });

  const pointBorderWidths = data.map(d => {
    const conf = getConfidence(d.count);
    if (conf === 'high') return 3;
    if (conf === 'medium') return 2;
    return 1;
  });

  // Chart data
  const chartData = {
    labels,
    datasets: [
      // Volume bars
      {
        type: 'bar',
        label: 'Transaction Volume',
        data: counts,
        backgroundColor: volumeBarColors,
        borderColor: volumeBarBorders,
        borderWidth: 2,
        yAxisID: 'yVolume',
        order: 4,
        barPercentage: 0.85,
        categoryPercentage: 0.9,
      },
      // P75 upper bound
      {
        type: 'line',
        label: 'P75 (Upper Bound)',
        data: psf75ths,
        borderColor: 'rgba(33, 52, 72, 0.3)',
        backgroundColor: 'rgba(148, 180, 193, 0.25)',
        borderWidth: 2,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: '+1',
        yAxisID: 'yPSF',
        order: 3,
      },
      // P25 lower bound
      {
        type: 'line',
        label: 'P25 (Lower Bound)',
        data: psf25ths,
        borderColor: 'rgba(33, 52, 72, 0.3)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        yAxisID: 'yPSF',
        order: 3,
      },
      // Median PSF line
      {
        type: 'line',
        label: 'Median PSF',
        data: medianPSFs,
        borderColor: '#213448',
        backgroundColor: 'transparent',
        borderWidth: 4,
        pointRadius: pointRadii,
        pointStyle: pointStyles,
        pointBackgroundColor: pointBgColors,
        pointBorderColor: '#213448',
        pointBorderWidth: pointBorderWidths,
        pointHoverRadius: 12,
        fill: false,
        yAxisID: 'yPSF',
        order: 1,
        tension: 0.1,
        segment: {
          borderDash: ctx => {
            const i = ctx.p0DataIndex;
            const c1 = getConfidence(counts[i]);
            const c2 = getConfidence(counts[i + 1]);
            if (c1 === 'low' || c2 === 'low') return [2, 4];
            if (c1 === 'medium' || c2 === 'medium') return [8, 4];
            return undefined;
          },
          borderWidth: ctx => {
            const i = ctx.p0DataIndex;
            const c1 = getConfidence(counts[i]);
            const c2 = getConfidence(counts[i + 1]);
            if (c1 === 'low' || c2 === 'low') return 2;
            if (c1 === 'medium' || c2 === 'medium') return 3;
            return 4;
          },
          borderColor: ctx => {
            const i = ctx.p0DataIndex;
            const c1 = getConfidence(counts[i]);
            const c2 = getConfidence(counts[i + 1]);
            if (c1 === 'low' || c2 === 'low') return 'rgba(33, 52, 72, 0.3)';
            if (c1 === 'medium' || c2 === 'medium') return 'rgba(33, 52, 72, 0.6)';
            return '#213448';
          },
        },
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
            const conf = getConfidence(d.count);
            const bandWidth = (d.psf_75th || 0) - (d.psf_25th || 0);
            const isCliff = i >= liquidityCliffIndex && liquidityCliffIndex >= 0;

            const confEmoji = conf === 'high' ? '🟢' : conf === 'medium' ? '🟡' : '🔴';
            const confText = conf === 'high' ? 'LIQUID' : conf === 'medium' ? 'THIN' : 'ILLIQUID';

            const lines = [
              '',
              `💰 Median PSF: $${Math.round(d.median_psf_actual || d.avg_psf || 0).toLocaleString()}`,
              `📊 Premium vs Low: ${premium >= 0 ? '+' : ''}${premium.toFixed(1)}%`,
              '',
              `📈 P25–P75 Range: $${Math.round(d.psf_25th || 0).toLocaleString()} – $${Math.round(d.psf_75th || 0).toLocaleString()}`,
              `   Band Width: $${Math.round(bandWidth).toLocaleString()} ${bandWidth > 300 ? '(Wide = Risk)' : '(Tight = Consensus)'}`,
              '',
              `📦 Transactions: ${d.count.toLocaleString()}`,
              `${confEmoji} Confidence: ${confText} (n=${d.count})`,
            ];

            if (isCliff) {
              lines.push('');
              lines.push('⚠️ LIQUIDITY CLIFF');
              lines.push('   Prices beyond here are aspirational,');
              lines.push('   not market-clearing.');
            }

            if (conf === 'low') {
              lines.push('');
              lines.push('❌ Weak price signal');
              lines.push('   Insufficient data to trust');
            }

            return lines;
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
        min: minPSF ? Math.floor(minPSF * 0.85) : undefined,
        max: maxPSF ? Math.ceil(maxPSF * 1.15) : undefined,
        grid: { color: 'rgba(148, 180, 193, 0.15)' },
        ticks: {
          color: '#213448',
          font: { weight: 'bold' },
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
  const liquidTiers = data.filter(d => getConfidence(d.count) === 'high').length;
  const thinTiers = data.filter(d => getConfidence(d.count) === 'medium').length;

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#94B4C1]/30">
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

      {/* Explicit Legend - IMPOSSIBLE TO MISS */}
      <div className="px-6 py-3 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          {/* Confidence Legend */}
          <div className="flex items-center gap-4">
            <span className="font-semibold text-[#213448] uppercase tracking-wide">Confidence:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#547792] border-2 border-[#213448]" />
              <span className="text-[#213448] font-medium">Liquid (n≥10)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-white border-2 border-[#213448] border-dashed" />
              <span className="text-[#547792]">Thin (5-9)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 text-[#999]">✕</div>
              <span className="text-[#999]">Illiquid (&lt;5)</span>
            </div>
          </div>

          {/* Band Legend */}
          <div className="flex items-center gap-2 border-l border-[#94B4C1]/30 pl-6">
            <div className="w-8 h-3 bg-[#94B4C1]/30 border border-[#213448]/20 border-dashed rounded" />
            <span className="text-[#547792]">P25–P75 Range</span>
            <span className="text-[#94B4C1] ml-1">(Narrow = Consensus, Wide = Risk)</span>
          </div>
        </div>
      </div>

      {/* Premium Pills Row */}
      <div className="px-6 py-2 border-b border-[#94B4C1]/20 bg-[#213448]/5">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-[#547792] uppercase tracking-wide shrink-0">Premium vs Low:</span>
          {data.map((d, i) => {
            const premium = premiums[i];
            const conf = getConfidence(d.count);
            const bgColor = conf === 'high'
              ? (premium > 0 ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-300')
              : conf === 'medium'
                ? 'bg-yellow-50 text-yellow-700 border-yellow-300 border-dashed'
                : 'bg-gray-100 text-gray-400 border-gray-200';

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

      {/* Liquidity Cliff Warning */}
      {liquidityCliffIndex >= 0 && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-medium">
              Liquidity Cliff at <span className="font-bold">{data[liquidityCliffIndex]?.floor_level}</span>
            </span>
            <span className="text-xs text-red-600">
              — Volume drops {Math.round((1 - counts[liquidityCliffIndex] / counts[liquidityCliffIndex - 1]) * 100)}%. Prices beyond are aspirational, not market-clearing.
            </span>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="p-4" style={{ height: height - 220 }}>
        <Chart ref={chartRef} type="bar" data={chartData} options={options} />
      </div>

      {/* Footer Stats */}
      <div className="px-6 py-3 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[#94B4C1]">Total Txns:</span>
              <span className="text-[#213448] font-bold">{totalTransactions.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#94B4C1]">Liquid Tiers:</span>
              <span className="text-green-600 font-bold">{liquidTiers}/{data.length}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#94B4C1]">Thin Tiers:</span>
              <span className="text-yellow-600 font-bold">{thinTiers}/{data.length}</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-[#94B4C1]/30 pl-4">
              <span className="text-[#94B4C1]">Premium Gradient:</span>
              <span className={`font-bold ${avgPremiumPerTier >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {avgPremiumPerTier >= 0 ? '+' : ''}{avgPremiumPerTier.toFixed(1)}%/tier
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#94B4C1]">Most Liquid:</span>
              <span className="text-[#213448] font-bold">{mostLiquidTier}</span>
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
