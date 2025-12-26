import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useStaleRequestGuard } from '../../hooks';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import { getAggField, AggField } from '../../schemas/apiContract';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Floor tier groupings for trend analysis
const FLOOR_TIERS = {
  'Upper': {
    levels: ['High', 'Luxury'],
    label: 'Upper (31+)',
    color: 'rgba(33, 52, 72, 1)',      // Deep Navy
    bgColor: 'rgba(33, 52, 72, 0.1)',
  },
  'Mid': {
    levels: ['Mid', 'Mid-High'],
    label: 'Mid (11-30)',
    color: 'rgba(84, 119, 146, 1)',    // Ocean Blue
    bgColor: 'rgba(84, 119, 146, 0.1)',
  },
  'Lower': {
    levels: ['Low', 'Mid-Low'],
    label: 'Lower (01-10)',
    color: 'rgba(148, 180, 193, 1)',   // Sky Blue
    bgColor: 'rgba(148, 180, 193, 0.1)',
  },
};

/**
 * Floor Premium Trend Chart
 *
 * Shows how floor premiums have evolved over time.
 * Compares Upper floors (31+) vs Mid (11-30) vs Lower (01-10)
 * to track if floor premiums are increasing or decreasing.
 *
 * X-axis: Year
 * Y-axis: Median PSF by floor tier group
 */
export function FloorPremiumTrendChart({ height = 300, bedroom, segment }) {
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);

  // Prevent stale responses from overwriting fresh data
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Fetch data grouped by year and floor_level
  useEffect(() => {
    const requestId = startRequest();
    const signal = getSignal();

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // We need to fetch data for each year and floor level combination
        // Using a custom approach: fetch by year, then by floor_level
        const params = buildApiParams({
          group_by: 'year,floor_level',
          metrics: 'count,median_psf_actual,avg_psf'
        });

        if (bedroom) params.bedroom = bedroom;
        if (segment) params.segment = segment;

        const response = await getAggregate(params, { signal });
        const data = response.data.data || [];

        // Ignore stale responses - a newer request has started
        if (isStale(requestId)) return;

        // Filter out Unknown floor levels (use getAggField for v1/v2 compatibility)
        const filtered = data.filter(d => {
          const floorLevel = getAggField(d, AggField.FLOOR_LEVEL);
          return floorLevel && floorLevel !== 'Unknown';
        });
        setRawData(filtered);
      } catch (err) {
        // Ignore abort errors - expected when request is cancelled
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        if (isStale(requestId)) return;
        console.error('Error fetching trend data:', err);
        setError(err.message);
      } finally {
        if (!isStale(requestId)) {
          setLoading(false);
        }
      }
    };

    fetchData();
    // debouncedFilterKey delays fetch by 200ms to prevent rapid-fire requests
    // buildApiParams/getSignal/startRequest/isStale are stable functions from context/hooks
  }, [debouncedFilterKey, bedroom, segment, buildApiParams, getSignal, startRequest, isStale]);

  // Process data into tier groups by year
  const processedData = useMemo(() => {
    if (rawData.length === 0) return { years: [], tiers: {} };

    // Get unique years and sort (use getAggField for v1/v2 compatibility)
    const yearsSet = new Set(rawData.map(d => getAggField(d, AggField.YEAR)));
    const years = Array.from(yearsSet).sort((a, b) => a - b);

    // Group data by year and calculate weighted average PSF for each tier
    const tierData = {};

    Object.entries(FLOOR_TIERS).forEach(([tierKey, tierConfig]) => {
      tierData[tierKey] = years.map(year => {
        // Get all records for this year and these floor levels
        const records = rawData.filter(d => {
          const rowYear = getAggField(d, AggField.YEAR);
          const floorLevel = getAggField(d, AggField.FLOOR_LEVEL);
          return rowYear === year && tierConfig.levels.includes(floorLevel);
        });

        if (records.length === 0) return null;

        // Calculate weighted average PSF
        let totalPsf = 0;
        let totalCount = 0;
        records.forEach(r => {
          const psf = getAggField(r, AggField.MEDIAN_PSF) || getAggField(r, AggField.AVG_PSF) || 0;
          const count = getAggField(r, AggField.COUNT) || 0;
          totalPsf += psf * count;
          totalCount += count;
        });

        return totalCount > 0 ? totalPsf / totalCount : null;
      });
    });

    return { years, tiers: tierData };
  }, [rawData]);

  // Calculate premium trends (Upper vs Lower baseline)
  const premiumTrends = useMemo(() => {
    const { years, tiers } = processedData;
    if (years.length === 0) return { years: [], premiums: {} };

    const premiums = {};

    Object.keys(FLOOR_TIERS).forEach(tierKey => {
      premiums[tierKey] = years.map((year, i) => {
        const tierPsf = tiers[tierKey]?.[i];
        const lowerPsf = tiers['Lower']?.[i];

        if (!tierPsf || !lowerPsf || lowerPsf === 0) return null;

        return ((tierPsf - lowerPsf) / lowerPsf) * 100;
      });
    });

    return { years, premiums };
  }, [processedData]);

  // Chart options - memoized (must be before early returns per React hooks rules)
  const options = useMemo(() => ({
    ...baseChartJsOptions,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: { size: 11 },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        titleColor: '#EAE0CF',
        bodyColor: '#EAE0CF',
        padding: 12,
        callbacks: {
          title: (items) => `Year ${items[0]?.label}`,
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return `${context.dataset.label}: No data`;
            return `${context.dataset.label}: ${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#547792',
          font: { weight: 'bold' },
        },
        title: {
          display: true,
          text: 'Year',
          color: '#213448',
          font: { size: 11 },
        },
      },
      y: {
        grid: { color: 'rgba(148, 180, 193, 0.2)' },
        ticks: {
          color: '#213448',
          callback: (v) => `${v >= 0 ? '+' : ''}${v}%`,
        },
        title: {
          display: true,
          text: 'Premium vs Lower Floors (%)',
          color: '#213448',
          font: { size: 11, weight: 'bold' },
        },
      },
    },
  }), []);

  // Card height for consistent alignment with FloorPremiumByRegionChart
  const cardHeight = height + 80;

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden flex flex-col" style={{ height: cardHeight }}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#547792]">Loading trend data...</span>
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

  const { years, premiums } = premiumTrends;

  if (years.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden flex flex-col" style={{ height: cardHeight }}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-[#547792]">No trend data available</div>
        </div>
      </div>
    );
  }

  // Build datasets - only Upper and Mid (Lower is always 0% as baseline)
  const datasets = [
    {
      label: FLOOR_TIERS.Upper.label,
      data: premiums.Upper,
      borderColor: FLOOR_TIERS.Upper.color,
      backgroundColor: FLOOR_TIERS.Upper.bgColor,
      borderWidth: 3,
      pointRadius: 5,
      pointBackgroundColor: FLOOR_TIERS.Upper.color,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      tension: 0.3,
      fill: false,
    },
    {
      label: FLOOR_TIERS.Mid.label,
      data: premiums.Mid,
      borderColor: FLOOR_TIERS.Mid.color,
      backgroundColor: FLOOR_TIERS.Mid.bgColor,
      borderWidth: 3,
      pointRadius: 5,
      pointBackgroundColor: FLOOR_TIERS.Mid.color,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      tension: 0.3,
      fill: false,
    },
    {
      label: `${FLOOR_TIERS.Lower.label} (Baseline)`,
      data: premiums.Lower, // Will be all 0s
      borderColor: FLOOR_TIERS.Lower.color,
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 0,
      tension: 0,
      fill: false,
    },
  ];

  const chartData = {
    labels: years.map(y => y.toString()),
    datasets,
  };

  // Calculate trend direction
  const getLatestTrend = (data) => {
    const valid = data.filter(v => v !== null);
    if (valid.length < 2) return null;
    const recent = valid.slice(-3);
    const first = recent[0];
    const last = recent[recent.length - 1];
    return last - first;
  };

  const upperTrend = getLatestTrend(premiums.Upper);
  const midTrend = getLatestTrend(premiums.Mid);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden flex flex-col" style={{ height: cardHeight }}>
      {/* Header - shrink-0 */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
        <h3 className="font-semibold text-[#213448]">Floor Premium Trend</h3>
        <p className="text-xs text-[#547792] mt-0.5">
          How floor premiums have evolved over time
        </p>
      </div>

      {/* Chart slot - flex-1 min-h-0 overflow-hidden */}
      <ChartSlot>
        <PreviewChartOverlay chartRef={chartRef}>
          <Chart ref={chartRef} type="line" data={chartData} options={options} />
        </PreviewChartOverlay>
      </ChartSlot>

      {/* Footer - wraps on mobile */}
      <div className="shrink-0 min-h-[44px] px-4 py-2 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="shrink-0 text-[#547792] font-medium">Recent Trend:</span>
        {upperTrend !== null && (
          <div className="shrink-0 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: FLOOR_TIERS.Upper.color }} />
            <span className="text-[#213448]">
              Upper {upperTrend >= 0 ? '↑' : '↓'} {Math.abs(upperTrend).toFixed(1)}pp
            </span>
          </div>
        )}
        {midTrend !== null && (
          <div className="shrink-0 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: FLOOR_TIERS.Mid.color }} />
            <span className="text-[#213448]">
              Mid {midTrend >= 0 ? '↑' : '↓'} {Math.abs(midTrend).toFixed(1)}pp
            </span>
          </div>
        )}
        <span className="shrink-0 text-[#547792] ml-auto">vs Lower floor baseline</span>
      </div>
    </div>
  );
}

export default FloorPremiumTrendChart;
