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
import { DrillButtons } from './DrillButtons';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

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
 * New Sale vs Resale (≤10 yrs lease age) Comparison Chart
 *
 * Dual-line time series showing:
 * - Line A (solid, blue): New Sale median total quantum (price)
 * - Line B (dashed, green): Resale (Lease age ≤10 years) median total quantum (price)
 *
 * RESPECTS GLOBAL SIDEBAR FILTERS (district, bedroom, segment, date range).
 * Only the drill level (year/quarter/month) is visual-local.
 *
 * Power BI Pattern: Global slicers MUST apply to ALL visuals.
 */
export function NewVsResaleChart({ height = 350 }) {
  // Get GLOBAL filters from context - respects sidebar selections
  const { buildApiParams, filters } = usePowerBIFilters();

  // Provide safe defaults for filters if context not ready
  const safeFilters = {
    districts: filters?.districts || [],
    bedroomTypes: filters?.bedroomTypes || [],
    segment: filters?.segment || null,
  };

  // LOCAL drill state only - year → quarter → month (visual-local)
  const [localDrillLevel, setLocalDrillLevel] = useState('quarter');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Fetch data when global filters or local drill level change
  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad.current) {
        setLoading(true);
      } else {
        setUpdating(true);
      }
      setError(null);

      try {
        // Use buildApiParams to include GLOBAL filters from sidebar
        // excludeHighlight: true - this is a time-series chart, preserve full timeline
        // (same pattern as TimeTrendChart - SOURCE charts don't filter themselves)
        const params = buildApiParams({
          timeGrain: localDrillLevel,
        }, { excludeHighlight: true });

        console.log('[NewVsResale] Fetching with params:', params);
        const response = await getNewVsResale(params);
        console.log('[NewVsResale] Response:', response.data);
        console.log('[NewVsResale] chartData length:', response.data?.chartData?.length);
        console.log('[NewVsResale] First data point:', response.data?.chartData?.[0]);
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
  }, [buildApiParams, localDrillLevel, filters]); // Re-fetch when global filters change (excludes highlight - preserves timeline)

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

  // Build filter summary for display
  const getFilterSummary = () => {
    const parts = [];
    if (safeFilters.districts.length > 0) {
      parts.push(safeFilters.districts.length === 1 ? safeFilters.districts[0] : `${safeFilters.districts.length} districts`);
    }
    if (safeFilters.segment) {
      parts.push(safeFilters.segment);
    }
    if (safeFilters.bedroomTypes.length > 0 && safeFilters.bedroomTypes.length < 4) {
      parts.push(`${safeFilters.bedroomTypes.join(',')}BR`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'All data';
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
  const newLaunchPrice = chartData.map(d => d.newLaunchPrice);
  const resalePrice = chartData.map(d => d.resalePrice);

  // Calculate data completeness for user awareness
  const resaleGaps = resalePrice.filter(v => v === null).length;
  const totalPoints = chartData.length;
  const hasSignificantGaps = resaleGaps > totalPoints * 0.2; // >20% gaps

  const chartConfig = {
    labels,
    datasets: [
      {
        label: 'New Sale',
        data: newLaunchPrice,
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
        label: 'Resale (≤10 yrs lease age)',
        data: resalePrice,
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
            return `${label}: $${value.toLocaleString()}`;
          },
          afterBody: (tooltipItems) => {
            const index = tooltipItems[0]?.dataIndex;
            if (index !== undefined && chartData[index]) {
              const dataPoint = chartData[index];
              const lines = [];

              // Show transaction counts for transparency
              if (dataPoint.newLaunchCount > 0) {
                lines.push(`New Sale: ${dataPoint.newLaunchCount} txns`);
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
              if (dataPoint.newLaunchPrice === null) {
                lines.push('(No new sale data)');
              }
              if (dataPoint.resalePrice === null) {
                lines.push('(No resale ≤10yr data)');
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
          text: 'Median Price ($)',
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
                New Sale vs Resale (≤10 yrs lease age)
              </h3>
              {updating && (
                <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-[#547792] mt-0.5">
              {getFilterSummary()} · by {drillLevelLabels[localDrillLevel].toLowerCase()}
              {hasSignificantGaps && (
                <span className="ml-2 text-amber-600">
                  (sparse resale data)
                </span>
              )}
            </p>
          </div>
          {/* Standardized DrillButtons in LOCAL mode - visual-local only */}
          <DrillButtons
            localLevel={localDrillLevel}
            localLevels={drillLevels}
            localLevelLabels={drillLevelLabels}
            onLocalDrillUp={handleDrillUp}
            onLocalDrillDown={handleDrillDown}
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
          Compares median total quantum of new sales with resale units (≤10 years lease age). Respects sidebar filters. Drill buttons change time granularity locally.
        </p>
      </div>
    </div>
  );
}

export default NewVsResaleChart;
