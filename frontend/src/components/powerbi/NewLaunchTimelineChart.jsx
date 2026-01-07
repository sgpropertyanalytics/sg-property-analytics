/**
 * New Launch Timeline Chart - Combo Chart (Bars + Line)
 *
 * Shows new launch activity and demand over time:
 * - Bars (left Y-axis): Total units launched per period
 * - Line (right Y-axis): Avg launch-month absorption % (0-100%)
 *
 * Tooltip shows: Total units, absorption %, projects launched, avg units/project
 *
 * RESPECTS GLOBAL SIDEBAR FILTERS (district, segment, bedroom, date range).
 * Only the drill level (year/quarter/month) is visual-local.
 */

import React, { useRef, useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
// Phase 3.2: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores';
import { TIME_GROUP_BY } from '../../context/PowerBIFilter';
import { getNewLaunchTimeline, getNewLaunchAbsorption } from '../../api/client';
import { PreviewChartOverlay, ChartSlot, KeyInsightBox } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { transformNewLaunchTimeline, transformNewLaunchAbsorption, is2020Period, assertKnownVersion, logFetchDebug } from '../../adapters';

// Singleton Chart.js registration
import '../../lib/chartjs-registry';

// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

/**
 * New Launch Timeline Chart Component
 *
 * @param {{ height?: number }} props
 */
function NewLaunchTimelineChartBase({ height = 300 }) {
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters, timeGrouping } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  const districts = filters.districts?.join(',') || '';
  const segments = filters.segments?.join(',') || '';

  // 2020 had heavily skewed new launch data - exclude by default
  const [include2020, setInclude2020] = useState(false);

  const chartRef = useRef(null);

  // Phase 4: Simplified data fetching - inline params, explicit query key
  const { data, status, error, isFetching, refetch } = useAppQuery(
    async (signal) => {
      // Inline params - no buildApiParams abstraction
      const params = {
        time_grain: TIME_GROUP_BY[timeGrouping],
        timeframe,
        bedroom,
        district: districts,
        segment: segments,
      };

      // Fetch both APIs in parallel
      const [timelineRes, absorptionRes] = await Promise.all([
        getNewLaunchTimeline(params, { signal }),
        getNewLaunchAbsorption(params, { signal }),
      ]);

      // Unwrap envelope (axios .data → response body → .data array)
      const timelinePayload = timelineRes.data?.data || timelineRes.data || [];
      const absorptionPayload = absorptionRes.data?.data || absorptionRes.data || [];

      // Validate API contract versions (dev/test only)
      assertKnownVersion(timelineRes.data, '/api/new-launch-timeline');
      assertKnownVersion(absorptionRes.data, '/api/new-launch-absorption');

      // Debug logging (dev only)
      logFetchDebug('NewLaunchTimelineChart', {
        endpoint: '/api/new-launch-timeline + /api/new-launch-absorption',
        timeGrain: timeGrouping,
        timelineRows: timelinePayload?.length || 0,
        absorptionRows: absorptionPayload?.length || 0,
      });

      // Transform each dataset
      const timelineData = transformNewLaunchTimeline(timelinePayload, TIME_GROUP_BY[timeGrouping]);
      const absorptionData = transformNewLaunchAbsorption(absorptionPayload, TIME_GROUP_BY[timeGrouping]);

      // Merge by periodLabel (join on period)
      return timelineData.map(t => {
        const absorption = absorptionData.find(a => a.periodLabel === t.periodLabel);
        return {
          ...t,
          avgAbsorption: absorption?.avgAbsorption ?? null,
          projectsMissing: absorption?.projectsMissing ?? 0,
        };
      });
    },
    // Explicit query key - TanStack handles cache deduplication
    ['new-launch-timeline', timeframe, bedroom, districts, segments, timeGrouping],
    {
      chartName: 'NewLaunchTimelineChart',
      initialData: null,  // null so hasRealData() returns false → shows skeleton during initial load
      keepPreviousData: true,
    }
  );

  // Default fallback for when data is null or unexpected type (initial load, edge cases)
  // Ensure safeData is always an array, even if API returns unexpected shape
  const safeData = Array.isArray(data) ? data : [];

  // Filter out 2020 if needed (heavily skewed data from COVID-era rush launches)
  // Uses Date-based check from adapter (not label string)
  const filteredData = include2020 ? safeData : safeData.filter(d => !is2020Period(d.periodStart));

  // Build filter summary for display
  const getFilterSummary = () => {
    const parts = [];
    // Show time filter info
    const tf = filters?.timeFilter;
    if (tf?.type === 'custom' && (tf.start || tf.end)) {
      const start = tf.start ? tf.start.slice(0, 7) : '...';
      const end = tf.end ? tf.end.slice(0, 7) : '...';
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
  const absorptionRates = filteredData.map(d => d.avgAbsorption);

  // Y-axis scaling - target 75% utilization (soft cap allows expansion if needed)
  const TARGET_UTIL = 0.75;
  const maxUnits = Math.max(...totalUnits, 1);
  const ySuggestedMax = Math.ceil(maxUnits / TARGET_UTIL);

  // Calculate summary stats
  const totalProjectCount = projectCounts.reduce((sum, v) => sum + v, 0);
  const totalUnitCount = totalUnits.reduce((sum, v) => sum + v, 0);
  const avgUnitsPerProject = totalProjectCount > 0 ? Math.round(totalUnitCount / totalProjectCount) : 0;

  // Calculate average absorption (excluding null values)
  const validAbsorptions = absorptionRates.filter(v => v != null);
  const avgAbsorption = validAbsorptions.length > 0
    ? (validAbsorptions.reduce((sum, v) => sum + v, 0) / validAbsorptions.length).toFixed(1)
    : null;

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Total Units',
        data: totalUnits,
        backgroundColor: 'rgba(148, 180, 193, 0.7)', // Sky #94B4C1
        borderColor: '#547792',
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: 'y',
        order: 2, // Render behind line
      },
      {
        type: 'line',
        label: 'Avg Absorption',
        data: absorptionRates,
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
        spanGaps: true, // Connect across null absorption values
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
                // Bar: Total Units
                return `${label}: ${value.toLocaleString()} units`;
              }
              // Line: Absorption %
              return `${label}: ${value.toFixed(1)}%`;
            },
            afterBody: (tooltipItems) => {
              const index = tooltipItems[0]?.dataIndex;
              if (index !== undefined && filteredData[index]) {
                const d = filteredData[index];
                const lines = [];
                lines.push(`Projects Launched: ${d.projectCount}`);
                if (d.avgUnitsPerProject > 0) {
                  lines.push(`Avg units/project: ${d.avgUnitsPerProject.toLocaleString()}`);
                }
                if (d.projectsMissing > 0) {
                  lines.push(`(${d.projectsMissing} project${d.projectsMissing > 1 ? 's' : ''} missing unit data)`);
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
            text: 'Units',
            ...CHART_AXIS_DEFAULTS.title,
          },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            callback: (value) => value.toLocaleString(),
          },
          grid: {
            color: 'rgba(148, 180, 193, 0.2)',
          },
        },
        y1: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 100,
          title: {
            display: true,
            text: 'Absorption %',
            ...CHART_AXIS_DEFAULTS.title,
          },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            callback: (value) => `${value}%`,
          },
          grid: {
            drawOnChartArea: false, // Don't draw grid lines for secondary axis
          },
        },
      },
    }),
    [ySuggestedMax, filteredData]
  );

  const hasData = filteredData.length > 0;
  const cardHeight = height + 160;

  return (
    <ChartFrame
      status={status}
      isFiltering={false}
      error={error}
      onRetry={refetch}
      empty={!hasData}
      skeleton="bar"
      height={height}
    >
      <div
          className="weapon-card hud-corner weapon-shadow overflow-hidden flex flex-col"
          style={{ height: cardHeight }}
        >
          {/* Header */}
          <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-mono-muted shrink-0">
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
                {avgAbsorption != null && (
                  <span className="px-3 py-1.5 rounded-full bg-[#213448]/10 text-[#213448] text-xs md:text-sm">
                    {avgAbsorption}% avg absorption
                  </span>
                )}
              </div>
            )}
          </div>

          {/* How to Interpret */}
          <div className="shrink-0">
            <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
              Tracks new launch supply and demand. Bars show total units launched; the line shows avg % sold in launch month.
              High bars + low line = oversupply. Low bars + high line = strong demand.
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
              <span className="text-xs text-[#374151]">Total Units</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="24" height="8">
                <line x1="0" y1="4" x2="24" y2="4" stroke="#213448" strokeWidth={2.5} />
              </svg>
              <span className="text-xs text-[#374151]">Avg Absorption %</span>
            </div>
          </div>
        </div>
    </ChartFrame>
  );
}

export const NewLaunchTimelineChart = React.memo(NewLaunchTimelineChartBase);

export default NewLaunchTimelineChart;
