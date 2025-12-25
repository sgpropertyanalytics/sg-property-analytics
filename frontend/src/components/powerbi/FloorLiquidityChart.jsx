import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useStaleRequestGuard } from '../../hooks';
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
import { PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  FLOOR_LEVEL_LABELS,
  getFloorLevelIndex,
} from '../../constants';
import { getAggField, AggField } from '../../schemas/apiContract';

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
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Prevent stale responses from overwriting fresh data
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Fetch floor level data
  useEffect(() => {
    const requestId = startRequest();
    const signal = getSignal();

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

        const response = await getAggregate(params, { signal });
        const rawData = response.data.data || [];

        // Use getAggField for v1/v2 compatibility
        const sortedData = rawData
          .filter(d => {
            const floorLevel = getAggField(d, AggField.FLOOR_LEVEL);
            return floorLevel && floorLevel !== 'Unknown';
          })
          .sort((a, b) => {
            const aLevel = getAggField(a, AggField.FLOOR_LEVEL);
            const bLevel = getAggField(b, AggField.FLOOR_LEVEL);
            return getFloorLevelIndex(aLevel) - getFloorLevelIndex(bLevel);
          });

        // Ignore stale responses - a newer request has started
        if (isStale(requestId)) return;

        setData(sortedData);
        isInitialLoad.current = false;
      } catch (err) {
        // Ignore abort errors - expected when request is cancelled
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        // Ignore errors from stale requests
        if (isStale(requestId)) return;
        console.error('Error fetching floor level data:', err);
        setError(err.message);
      } finally {
        // Only clear loading for the current request
        if (!isStale(requestId)) {
          setLoading(false);
          setUpdating(false);
        }
      }
    };

    fetchData();
    // debouncedFilterKey delays fetch by 200ms to prevent rapid-fire requests
  }, [debouncedFilterKey, bedroom, segment, startRequest, isStale]);

  // Calculate baseline for premium calculation (use getAggField for v1/v2 compatibility)
  const baselinePSF = useMemo(() => {
    const lowFloor = data.find(d => getAggField(d, AggField.FLOOR_LEVEL) === 'Low');
    return lowFloor
      ? (getAggField(lowFloor, AggField.MEDIAN_PSF) || getAggField(lowFloor, AggField.AVG_PSF) || 0)
      : 0;
  }, [data]);

  // Calculate premiums (use getAggField for v1/v2 compatibility)
  const premiums = useMemo(() => {
    if (!baselinePSF) return data.map(() => 0);
    return data.map(d => {
      const psf = getAggField(d, AggField.MEDIAN_PSF) || getAggField(d, AggField.AVG_PSF) || 0;
      return ((psf - baselinePSF) / baselinePSF) * 100;
    });
  }, [data, baselinePSF]);

  // Pre-compute all values needed for options useMemo (must be before early returns)
  const chartComputations = useMemo(() => {
    if (data.length === 0) {
      return { labels: [], counts: [], medianPSFs: [], psf25ths: [], psf75ths: [], minPSF: 0, maxPSF: 0, maxCount: 0 };
    }
    const labels = data.map(d => {
      const floorLevel = getAggField(d, AggField.FLOOR_LEVEL);
      return FLOOR_LEVEL_LABELS[floorLevel] || floorLevel;
    });
    const counts = data.map(d => getAggField(d, AggField.COUNT) || 0);
    const medianPSFs = data.map(d => getAggField(d, AggField.MEDIAN_PSF) || getAggField(d, AggField.AVG_PSF) || null);
    const psf25ths = data.map(d => getAggField(d, AggField.PSF_25TH) || null);
    const psf75ths = data.map(d => getAggField(d, AggField.PSF_75TH) || null);
    const maxCount = Math.max(...counts);
    const maxPSF = Math.max(...medianPSFs.filter(v => v !== null));
    const minPSF = Math.min(...psf25ths.filter(v => v !== null));
    return { labels, counts, medianPSFs, psf25ths, psf75ths, minPSF, maxPSF, maxCount };
  }, [data]);

  // Chart options - memoized to prevent unnecessary re-renders (must be before early returns)
  const options = useMemo(() => ({
    ...baseChartJsOptions,
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
            if (i === undefined || !data[i]) return '';
            const floorLevel = getAggField(data[i], AggField.FLOOR_LEVEL);
            return `${floorLevel} Floor`;
          },
          label: () => '',
          afterBody: (items) => {
            const i = items[0]?.dataIndex;
            if (i === undefined || !data[i]) return [];

            const d = data[i];
            const premium = premiums[i];
            const psf75 = getAggField(d, AggField.PSF_75TH) || 0;
            const psf25 = getAggField(d, AggField.PSF_25TH) || 0;
            const bandWidth = psf75 - psf25;
            const medianPsf = getAggField(d, AggField.MEDIAN_PSF) || getAggField(d, AggField.AVG_PSF) || 0;
            const count = getAggField(d, AggField.COUNT) || 0;

            return [
              '',
              `Median PSF: $${Math.round(medianPsf).toLocaleString()}`,
              `Premium vs Low: ${premium >= 0 ? '+' : ''}${premium.toFixed(1)}%`,
              '',
              `P25: $${Math.round(psf25).toLocaleString()}`,
              `P75: $${Math.round(psf75).toLocaleString()}`,
              `Spread: $${Math.round(bandWidth).toLocaleString()}`,
              '',
              `Transactions: ${count.toLocaleString()}`,
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
        min: chartComputations.minPSF ? Math.floor(chartComputations.minPSF / 500) * 500 : undefined,
        max: chartComputations.maxPSF ? Math.ceil(chartComputations.maxPSF / 500) * 500 : undefined,
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
        max: chartComputations.maxCount * 1.3,
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
  }), [data, premiums, chartComputations]);

  // Card height - hero chart uses full height prop
  const cardHeight = height + 180; // Extra space for header/legend/premium pills/footer

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden flex flex-col" style={{ height: cardHeight }}>
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
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden flex flex-col" style={{ height: cardHeight }}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden flex flex-col" style={{ height: cardHeight }}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-[#547792]">No floor level data available for current filters</div>
        </div>
      </div>
    );
  }

  // Extract from computed values (safe after early returns)
  const { labels, counts, medianPSFs, psf25ths, psf75ths, maxCount } = chartComputations;
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

  // Summary stats
  const avgPremiumPerTier = premiums.length > 1
    ? (premiums[premiums.length - 1] - premiums[0]) / (premiums.length - 1)
    : 0;
  const mostLiquidTier = data[counts.indexOf(maxCount)]?.floor_level;

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden flex flex-col transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`} style={{ height: cardHeight }}>
      {/* Header - shrink-0 */}
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

      {/* Simple Legend - shrink-0 */}
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

      {/* Premium Pills Row - shrink-0 */}
      <div className="px-6 py-2 border-b border-[#94B4C1]/20 bg-[#213448]/5 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#547792] uppercase tracking-wide shrink-0">Premium vs Low:</span>
          {data.map((d, i) => {
            const premium = premiums[i];
            const floorLevel = getAggField(d, AggField.FLOOR_LEVEL);
            const bgColor = premium > 0
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-50 text-gray-600 border-gray-200';

            return (
              <div
                key={floorLevel}
                className={`px-2 py-1 rounded border text-xs font-mono shrink-0 ${bgColor}`}
              >
                <span className="font-semibold">{floorLevel}</span>
                <span className="ml-1">
                  {premium >= 0 ? '+' : ''}{premium.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chart slot - flex-1 min-h-0 overflow-hidden */}
      <ChartSlot>
        <PreviewChartOverlay chartRef={chartRef}>
          <Chart ref={chartRef} type="bar" data={chartData} options={options} />
        </PreviewChartOverlay>
      </ChartSlot>

      {/* Footer - wraps on mobile for consistent alignment */}
      <div className="shrink-0 min-h-[44px] px-6 py-2 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center gap-4 shrink-0">
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
        <span className="shrink-0 text-[#94B4C1]">Hover for details</span>
      </div>
    </div>
  );
}

export default FloorLiquidityChart;
