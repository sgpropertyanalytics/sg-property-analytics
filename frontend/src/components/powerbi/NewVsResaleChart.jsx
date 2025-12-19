import React, { useEffect, useState, useRef } from 'react';
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
import { Line } from 'react-chartjs-2';
import { getNewVsResale } from '../../api/client';

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

/**
 * New Launch vs Resale Comparison Chart
 *
 * Dual-line time series showing:
 * - Line A (solid, blue): New Launch median PSF
 * - Line B (dashed, green): Resale (Lease age < 10 years) median PSF
 *
 * Features:
 * - LOCAL filters (does NOT affect other charts on page)
 * - LOCAL drill up/down (year → quarter → month) - visual-local only
 * - KPI badges showing current premium and period average
 * - Trend indicator when difference >= 2%
 *
 * Power BI Best Practice: Drill is visual-local by default.
 * Drill ≠ Filter. Drill changes level of detail inside one chart only.
 */
export function NewVsResaleChart({ height = 350 }) {
  // LOCAL state only - does not affect other charts
  const [localRegion, setLocalRegion] = useState('ALL');
  const [localBedroom, setLocalBedroom] = useState('ALL');
  // LOCAL drill state - year → quarter → month (visual-local, not global)
  const [localDrillLevel, setLocalDrillLevel] = useState('quarter');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Fetch data when local filters or drill level change
  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad.current) {
        setLoading(true);
      } else {
        setUpdating(true);
      }
      setError(null);

      try {
        const response = await getNewVsResale({
          region: localRegion,
          bedroom: localBedroom,
          timeGrain: localDrillLevel,
        });
        setData(response.data);
        isInitialLoad.current = false;
      } catch (err) {
        console.error('Error fetching new vs resale data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setUpdating(false);
      }
    };
    fetchData();
  }, [localRegion, localBedroom, localDrillLevel]);

  // LOCAL drill handlers - visual-local only, does NOT affect other charts
  const drillLevels = ['year', 'quarter', 'month'];
  const drillLevelLabels = { year: 'Year', quarter: 'Quarter', month: 'Month' };
  const currentDrillIndex = drillLevels.indexOf(localDrillLevel);
  const canDrillUp = currentDrillIndex > 0;
  const canDrillDown = currentDrillIndex < drillLevels.length - 1;

  const handleDrillUp = () => {
    if (canDrillUp) {
      setLocalDrillLevel(drillLevels[currentDrillIndex - 1]);
    }
  };

  const handleDrillDown = () => {
    if (canDrillDown) {
      setLocalDrillLevel(drillLevels[currentDrillIndex + 1]);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-[#547792]">Loading chart...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  const chartData = data?.chartData || [];
  const summary = data?.summary || {};

  // Prepare chart data
  const labels = chartData.map(d => d.period);
  const newLaunchPsf = chartData.map(d => d.newLaunchPsf);
  const resalePsf = chartData.map(d => d.resalePsf);

  // Calculate data completeness for user awareness
  const newLaunchGaps = newLaunchPsf.filter(v => v === null).length;
  const resaleGaps = resalePsf.filter(v => v === null).length;
  const totalPoints = chartData.length;
  const hasSignificantGaps = resaleGaps > totalPoints * 0.2; // >20% gaps

  const chartConfig = {
    labels,
    datasets: [
      {
        label: 'New Launch',
        data: newLaunchPsf,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#3B82F6',
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        tension: 0.3,
        fill: false,
        spanGaps: true, // Connect line through null/missing data points
      },
      {
        label: 'Resale (< 10 yrs)',
        data: resalePsf,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 4,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        tension: 0.3,
        fill: false,
        spanGaps: true, // Connect line through null/missing data points
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
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 11,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (value === null || value === undefined) return `${label}: No data`;
            return `${label}: $${value.toLocaleString()} PSF`;
          },
          afterBody: (tooltipItems) => {
            const index = tooltipItems[0]?.dataIndex;
            if (index !== undefined && chartData[index]) {
              const dataPoint = chartData[index];
              const lines = [];

              // Show transaction counts for transparency
              if (dataPoint.newLaunchCount > 0) {
                lines.push(`New Launch: ${dataPoint.newLaunchCount} txns`);
              }
              if (dataPoint.resaleCount > 0) {
                lines.push(`Resale: ${dataPoint.resaleCount} txns`);
              }

              // Show premium if both values exist
              const premium = dataPoint.premiumPct;
              if (premium !== null && premium !== undefined) {
                lines.push(`Premium: ${premium > 0 ? '+' : ''}${premium}%`);
              }

              // Indicate missing data
              if (dataPoint.newLaunchPsf === null) {
                lines.push('(No new launch data)');
              }
              if (dataPoint.resalePsf === null) {
                lines.push('(No resale <10yr data)');
              }

              return lines;
            }
            return [];
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
          // Show fewer labels on mobile
          callback: function(value, index, ticks) {
            // Show every label on desktop, every 2nd on tablet, every 3rd on mobile
            if (typeof window !== 'undefined') {
              if (window.innerWidth < 640 && index % 3 !== 0) return '';
              if (window.innerWidth < 1024 && index % 2 !== 0) return '';
            }
            return this.getLabelForValue(value);
          },
        },
      },
      y: {
        title: {
          display: true,
          text: 'PSF ($)',
          font: {
            size: 11,
          },
        },
        ticks: {
          callback: (value) => `$${value.toLocaleString()}`,
          font: {
            size: 10,
          },
        },
        grid: {
          color: 'rgba(148, 180, 193, 0.2)',
        },
      },
    },
  };

  // Trend indicator icon
  const getTrendIcon = (trend) => {
    if (trend === 'widening') {
      return (
        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    }
    if (trend === 'narrowing') {
      return (
        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      );
    }
    return null;
  };

  return (
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#213448] text-sm md:text-base">
                New Launch vs Resale
              </h3>
              {updating && (
                <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-[#547792] mt-0.5">
              Median PSF comparison by {drillLevelLabels[localDrillLevel].toLowerCase()}
              {hasSignificantGaps && (
                <span className="ml-2 text-amber-600">
                  (sparse resale data for this filter)
                </span>
              )}
            </p>
          </div>
          {/* LOCAL Drill Up/Down Buttons - visual-local only */}
          <div className="flex items-center gap-1">
            {/* Drill Up */}
            <button
              type="button"
              onClick={handleDrillUp}
              disabled={!canDrillUp}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 ${
                canDrillUp
                  ? 'bg-white border border-[#94B4C1] hover:bg-[#EAE0CF] hover:border-[#547792] text-[#547792] shadow-sm'
                  : 'bg-[#EAE0CF]/50 border border-[#94B4C1]/50 text-[#94B4C1] cursor-not-allowed'
              }`}
              title={canDrillUp ? `Drill up to ${drillLevelLabels[drillLevels[currentDrillIndex - 1]]}` : 'At top level'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9V3" />
                <path d="M3 6l3-3 3 3" />
              </svg>
            </button>
            {/* Drill Down */}
            <button
              type="button"
              onClick={handleDrillDown}
              disabled={!canDrillDown}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 ${
                canDrillDown
                  ? 'bg-white border border-[#94B4C1] hover:bg-[#EAE0CF] hover:border-[#547792] text-[#547792] shadow-sm'
                  : 'bg-[#EAE0CF]/50 border border-[#94B4C1]/50 text-[#94B4C1] cursor-not-allowed'
              }`}
              title={canDrillDown ? `Drill down to ${drillLevelLabels[drillLevels[currentDrillIndex + 1]]}` : 'At lowest level'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3v6" />
                <path d="M3 6l3 3 3-3" />
              </svg>
            </button>
            {/* Current level label */}
            <span className="ml-1 text-xs text-[#547792] font-medium whitespace-nowrap">
              {drillLevelLabels[localDrillLevel]}
            </span>
          </div>
        </div>

        {/* Local Filters - compact inline (Region & Bedroom only, Period removed) */}
        <div className="flex flex-wrap gap-2 mt-3">
          <LocalFilter
            label="Region"
            value={localRegion}
            onChange={setLocalRegion}
            options={['ALL', 'CCR', 'RCR', 'OCR']}
          />
          <LocalFilter
            label="Bedroom"
            value={localBedroom}
            onChange={setLocalBedroom}
            options={['ALL', '1BR', '2BR', '3BR', '4BR+']}
          />
        </div>

        {/* Premium KPIs */}
        <div className="flex flex-wrap gap-2 mt-3">
          {summary.currentPremium !== null && summary.currentPremium !== undefined && (
            <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs md:text-sm font-medium inline-flex items-center gap-1">
              Current: {summary.currentPremium > 0 ? '+' : ''}{summary.currentPremium}%
              {getTrendIcon(summary.premiumTrend)}
            </span>
          )}
          {summary.avgPremium10Y !== null && summary.avgPremium10Y !== undefined && (
            <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs md:text-sm">
              Period Avg: {summary.avgPremium10Y > 0 ? '+' : ''}{summary.avgPremium10Y}%
            </span>
          )}
          {summary.premiumTrend && summary.premiumTrend !== 'stable' && (
            <span className={`px-3 py-1.5 rounded-full text-xs md:text-sm ${
              summary.premiumTrend === 'widening'
                ? 'bg-red-50 text-red-700'
                : 'bg-green-50 text-green-700'
            }`}>
              {summary.premiumTrend === 'widening' ? 'Gap widening' : 'Gap narrowing'}
            </span>
          )}
        </div>
      </div>

      {/* Chart Container - follows chart-container-contract skill */}
      <div className="p-2 md:p-3 lg:p-4" style={{ height }}>
        {chartData.length > 0 ? (
          <Line ref={chartRef} data={chartConfig} options={options} />
        ) : (
          <div className="flex items-center justify-center h-full text-[#547792]">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm">No data available for selected filters</p>
            </div>
          </div>
        )}
      </div>

      {/* Info tooltip */}
      <div className="px-3 py-2 md:px-4 md:py-2 border-t border-[#94B4C1]/30 bg-gray-50">
        <p className="text-[10px] md:text-xs text-[#547792]">
          Controls for age by comparing new launches with near-new resale units. Use drill buttons to change time granularity. All controls are local to this chart only.
        </p>
      </div>
    </div>
  );
}

/**
 * Compact local filter component - stays inline on all screen sizes
 */
function LocalFilter({ label, value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="
        px-2 py-1.5 text-xs border border-[#94B4C1]/50 rounded bg-white
        min-w-[80px] min-h-[32px]
        focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-[#547792]
        cursor-pointer
      "
      aria-label={label}
    >
      {options.map(opt => (
        <option key={opt} value={opt}>
          {label}: {opt}
        </option>
      ))}
    </select>
  );
}

export default NewVsResaleChart;
