import React, { useEffect, useState, useRef, useMemo } from 'react';
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
import { KeyInsightBox } from '../ui/KeyInsightBox';

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
  const { buildApiParams, filters } = usePowerBIFilters();
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);

  // Fetch data grouped by year and floor_level
  useEffect(() => {
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

        const response = await getAggregate(params);
        const data = response.data.data || [];

        // Filter out Unknown floor levels
        const filtered = data.filter(d => d.floor_level && d.floor_level !== 'Unknown');
        setRawData(filtered);
      } catch (err) {
        console.error('Error fetching trend data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [buildApiParams, filters, bedroom, segment]);

  // Process data into tier groups by year
  const processedData = useMemo(() => {
    if (rawData.length === 0) return { years: [], tiers: {} };

    // Get unique years and sort
    const yearsSet = new Set(rawData.map(d => d.year));
    const years = Array.from(yearsSet).sort((a, b) => a - b);

    // Group data by year and calculate weighted average PSF for each tier
    const tierData = {};

    Object.entries(FLOOR_TIERS).forEach(([tierKey, tierConfig]) => {
      tierData[tierKey] = years.map(year => {
        // Get all records for this year and these floor levels
        const records = rawData.filter(
          d => d.year === year && tierConfig.levels.includes(d.floor_level)
        );

        if (records.length === 0) return null;

        // Calculate weighted average PSF
        let totalPsf = 0;
        let totalCount = 0;
        records.forEach(r => {
          const psf = r.median_psf_actual || r.avg_psf || 0;
          const count = r.count || 0;
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
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
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  const { years, premiums } = premiumTrends;

  if (years.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
    <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <h3 className="font-semibold text-[#213448]">Floor Premium Trend</h3>
        <p className="text-xs text-[#547792] mt-0.5">
          How floor premiums have changed over the years
        </p>
      </div>

      {/* Dynamic Key Insight */}
      <KeyInsightBox
        title="Key Takeaway"
        variant={upperTrend !== null && upperTrend > 2 ? 'positive' : upperTrend !== null && upperTrend < -2 ? 'warning' : 'info'}
      >
        {upperTrend !== null && upperTrend > 2 ? (
          <>
            <span className="font-semibold text-[#213448]">Floor premiums are increasing</span> -
            high-floor units are becoming relatively more expensive compared to lower floors.
          </>
        ) : upperTrend !== null && upperTrend < -2 ? (
          <>
            <span className="font-semibold text-[#213448]">Floor premiums are compressing</span> -
            the price gap between high and low floors is shrinking.
          </>
        ) : (
          <>
            <span className="font-semibold text-[#213448]">Floor premiums are stable</span> -
            the relative value of high floors vs low floors has remained consistent.
          </>
        )}
      </KeyInsightBox>

      {/* Chart */}
      <div className="p-4" style={{ height: height - 100 }}>
        <Chart ref={chartRef} type="line" data={chartData} options={options} />
      </div>

      {/* Footer - Recent changes */}
      <div className="px-4 py-3 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30">
        <div className="flex flex-wrap items-center gap-3 text-xs mb-2">
          <span className="text-[#94B4C1] font-medium">Recent Change (last 3 years):</span>
          {upperTrend !== null && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white border border-[#94B4C1]/30">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: FLOOR_TIERS.Upper.color }} />
              <span className="text-[#213448] font-medium">
                Upper floors: {upperTrend >= 0 ? 'Up' : 'Down'} {Math.abs(upperTrend).toFixed(1)} points
              </span>
            </div>
          )}
          {midTrend !== null && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white border border-[#94B4C1]/30">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: FLOOR_TIERS.Mid.color }} />
              <span className="text-[#213448] font-medium">
                Mid floors: {midTrend >= 0 ? 'Up' : 'Down'} {Math.abs(midTrend).toFixed(1)} points
              </span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-[#94B4C1]">
          * Points = percentage point change in premium (e.g., +5 points means premium grew from 10% to 15%)
        </p>
      </div>
    </div>
  );
}

export default FloorPremiumTrendChart;
