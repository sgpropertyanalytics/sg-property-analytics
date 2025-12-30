/**
 * New Launch Timeline Chart - Combo Chart (Bars + Line)
 *
 * Shows new launch activity over time:
 * - Bars (left Y-axis): Number of projects launched per period
 * - Line (right Y-axis): Total units launched per period
 *
 * Tooltip shows: Project count, unit count, avg units/project
 *
 * RESPECTS GLOBAL SIDEBAR FILTERS (district, segment, bedroom, date range).
 * Only the drill level (year/quarter/month) is visual-local.
 */

import React, { useRef, useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import { useAbortableQuery, useDeferredFetch } from '../../hooks';
import { QueryState } from '../common/QueryState';
import { usePowerBIFilters, TIME_GROUP_BY } from '../../context/PowerBIFilter';
import { getNewLaunchTimeline } from '../../api/client';
import { PreviewChartOverlay, ChartSlot, KeyInsightBox } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { transformNewLaunchTimeline, assertKnownVersion, logFetchDebug } from '../../adapters';

// Singleton Chart.js registration
import '../../lib/chartjs-registry';

// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

// 2020 had heavily skewed new launch data - exclude by default
const is2020Period = (label) => label?.toString().includes('2020');

/**
 * New Launch Timeline Chart Component
 *
 * @param {Object} props
 * @param {number} props.height - Chart height in pixels
 */
export const NewLaunchTimelineChart = React.memo(function NewLaunchTimelineChart({
  height = 300,
}) {
  // Get GLOBAL filters and timeGrouping from context
  const { buildApiParams, debouncedFilterKey, filters, timeGrouping } = usePowerBIFilters();

  // 2020 had heavily skewed new launch data - exclude by default
  const [include2020, setInclude2020] = useState(false);

  const chartRef = useRef(null);

  // Defer fetch until chart is visible
  const { shouldFetch, containerRef } = useDeferredFetch({
    filterKey: `${debouncedFilterKey}:${timeGrouping}`,
    priority: 'low',
    fetchOnMount: true,
  });

  // Data fetching with useAbortableQuery
  const { data, loading, error, isFetching, refetch } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({
        time_grain: TIME_GROUP_BY[timeGrouping],
      });

      const response = await getNewLaunchTimeline(params, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/new-launch-timeline');

      // Debug logging (dev only)
      logFetchDebug('NewLaunchTimelineChart', {
        endpoint: '/api/new-launch-timeline',
        timeGrain: timeGrouping,
        rowCount: response.data?.data?.length || 0,
      });

      // Use adapter for transformation
      return transformNewLaunchTimeline(response.data?.data || [], TIME_GROUP_BY[timeGrouping]);
    },
    [debouncedFilterKey, timeGrouping],
    {
      initialData: [],
      enabled: shouldFetch,
      keepPreviousData: true,
    }
  );

  // Filter out 2020 if needed (heavily skewed data from COVID-era rush launches)
  const filteredData = include2020 ? data : data.filter(d => !is2020Period(d.periodLabel));

  // Build filter summary for display
  const getFilterSummary = () => {
    const parts = [];
    if (filters?.dateRange?.start || filters?.dateRange?.end) {
      const start = filters.dateRange.start ? filters.dateRange.start.slice(0, 7) : '...';
      const end = filters.dateRange.end ? filters.dateRange.end.slice(0, 7) : '...';
      parts.push(`${start} to ${end}`);
    }
    if (filters?.districts?.length > 0) {
      parts.push(filters.districts.length === 1 ? filters.districts[0] : `${filters.districts.length} districts`);
    }
    if (filters?.segments?.length > 0) {
      parts.push(filters.segments.join(', '));
    }
    if (filters?.bedroomTypes?.length > 0 && filters.bedroomTypes.length < 5) {
      parts.push(`${filters.bedroomTypes.join(',')}BR`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'All data';
  };

  // Prepare chart data (use filteredData instead of raw data)
  const labels = filteredData.map(d => d.periodLabel);
  const projectCounts = filteredData.map(d => d.projectCount);
  const totalUnits = filteredData.map(d => d.totalUnits);

  // Y-axis scaling - target 75% utilization (soft cap allows expansion if needed)
  // Small counts (<=10): dataMax + 2 for clean integer ticks (e.g., 6 → 8 = 75%)
  // Larger values: ceil(dataMax / 0.75) for 75% target utilization
  const TARGET_UTIL = 0.75;
  const maxProjects = Math.max(...projectCounts, 1);
  const maxUnits = Math.max(...totalUnits, 1);
  const ySuggestedMax = maxProjects <= 10 ? maxProjects + 2 : Math.ceil(maxProjects / TARGET_UTIL);
  const y1SuggestedMax = Math.ceil(maxUnits / TARGET_UTIL);

  // Calculate summary stats
  const totalProjectCount = projectCounts.reduce((sum, v) => sum + v, 0);
  const totalUnitCount = totalUnits.reduce((sum, v) => sum + v, 0);
  const avgUnitsPerProject = totalProjectCount > 0 ? Math.round(totalUnitCount / totalProjectCount) : 0;

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Projects Launched',
        data: projectCounts,
        backgroundColor: 'rgba(148, 180, 193, 0.7)', // Sky #94B4C1
        borderColor: '#547792',
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: 'y',
        order: 2, // Render behind line
      },
      {
        type: 'line',
        label: 'Total Units',
        data: totalUnits,
        borderColor: '#213448', // Navy
        backgroundColor: 'rgba(33, 52, 72, 0.05)',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#213448',
        pointHoverBorderColor: '#fff',
        tension: 0.3,
        yAxisID: 'y1',
        order: 1, // Render on top
      },
    ],
  };

  const options = useMemo(
    () => ({
      ...baseChartJsOptions,
      animation: {
        duration: 400,
        easing: 'easeOutQuart',
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y;
              if (value === null || value === undefined) return `${label}: No data`;
              if (context.datasetIndex === 0) {
                return `${label}: ${value} projects`;
              }
              return `${label}: ${value.toLocaleString()} units`;
            },
            afterBody: (tooltipItems) => {
              const index = tooltipItems[0]?.dataIndex;
              if (index !== undefined && filteredData[index]) {
                const d = filteredData[index];
                if (d.avgUnitsPerProject > 0) {
                  return [`Avg units/project: ${d.avgUnitsPerProject.toLocaleString()}`];
                }
              }
              return [];
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            maxRotation: 45,
            minRotation: 45,
            callback: function (value, index) {
              // Show fewer labels on mobile
              if (typeof window !== 'undefined') {
                if (window.innerWidth < 640 && index % 3 !== 0) return '';
                if (window.innerWidth < 1024 && index % 2 !== 0) return '';
              }
              return this.getLabelForValue(value);
            },
          },
        },
        y: {
          type: 'linear',
          position: 'left',
          suggestedMax: ySuggestedMax,  // Soft cap - can expand if data exceeds
          title: {
            display: true,
            text: 'Projects',
            ...CHART_AXIS_DEFAULTS.title,
          },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            stepSize: maxProjects <= 10 ? 1 : Math.ceil(ySuggestedMax / 5),  // Integer ticks for small counts
          },
          grid: {
            color: 'rgba(148, 180, 193, 0.2)',
          },
        },
        y1: {
          type: 'linear',
          position: 'right',
          suggestedMax: y1SuggestedMax,  // Soft cap - can expand if data exceeds
          title: {
            display: true,
            text: 'Units',
            ...CHART_AXIS_DEFAULTS.title,
          },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            callback: (value) => value.toLocaleString(),
          },
          grid: {
            drawOnChartArea: false, // Don't draw grid lines for secondary axis
          },
        },
      },
    }),
    [ySuggestedMax, y1SuggestedMax, maxProjects, filteredData]
  );

  const hasData = filteredData.length > 0;
  const cardHeight = height + 160;

  return (
    <div ref={containerRef}>
      <QueryState loading={loading} error={error} onRetry={refetch} empty={!hasData} skeleton="bar" height={height}>
        <div
          className="bg-card rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
          style={{ height: cardHeight }}
        >
          {/* Header */}
          <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[#94B4C1]/30 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-[#213448] text-sm md:text-base flex items-center gap-2">
                  New Launch Activity
                  {isFetching && (
                    <span className="w-3 h-3 border-2 border-[#547792]/30 border-t-[#547792] rounded-full animate-spin" />
                  )}
                </h3>
                <p className="text-xs text-[#547792] mt-0.5">
                  {getFilterSummary()} · by {TIME_LABELS[timeGrouping].toLowerCase()}
                </p>
              </div>
              {/* Toggle for 2020 data - heavily skewed due to COVID-era rush launches */}
              <button
                onClick={() => setInclude2020(!include2020)}
                className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  include2020
                    ? 'bg-[#213448] text-white border-[#213448]'
                    : 'bg-white text-[#547792] border-[#94B4C1] hover:bg-[#EAE0CF]/50'
                }`}
              >
                {include2020 ? 'Hide 2020' : 'Include 2020'}
              </button>
            </div>

            {/* Summary KPIs */}
            {hasData && (
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-3 py-1.5 rounded-full bg-[#94B4C1]/20 text-[#547792] text-xs md:text-sm font-medium">
                  {totalProjectCount} projects
                </span>
                <span className="px-3 py-1.5 rounded-full bg-[#213448]/10 text-[#213448] text-xs md:text-sm">
                  {totalUnitCount.toLocaleString()} units total
                </span>
                {avgUnitsPerProject > 0 && (
                  <span className="px-3 py-1.5 rounded-full bg-[#EAE0CF]/50 text-[#547792] text-xs md:text-sm">
                    ~{avgUnitsPerProject} units/project
                  </span>
                )}
              </div>
            )}
          </div>

          {/* How to Interpret */}
          <div className="shrink-0">
            <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
              Tracks new project launches over time. Bars show project count; the line shows total units launched.
            </KeyInsightBox>
          </div>

          {/* Chart slot */}
          <ChartSlot>
            {hasData ? (
              <PreviewChartOverlay chartRef={chartRef}>
                <Chart ref={chartRef} type="bar" data={chartData} options={options} />
              </PreviewChartOverlay>
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
          </ChartSlot>

          {/* Custom SVG Legend */}
          <div className="flex justify-center gap-6 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded-sm bg-[#94B4C1]" />
              <span className="text-xs text-[#374151]">Projects Launched</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="24" height="8">
                <line x1="0" y1="4" x2="24" y2="4" stroke="#213448" strokeWidth={2.5} />
              </svg>
              <span className="text-xs text-[#374151]">Total Units</span>
            </div>
          </div>
        </div>
      </QueryState>
    </div>
  );
});

export default NewLaunchTimelineChart;
