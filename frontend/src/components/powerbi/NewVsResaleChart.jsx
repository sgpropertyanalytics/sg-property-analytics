import React, { useRef, useMemo, useEffect } from 'react';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery, QueryStatus } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
// Chart.js components registered globally in chartSetup.js
import { Line } from 'react-chartjs-2';
import { getNewVsResale } from '../../api/client';
// Phase 3.2: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores';
import { TIME_GROUP_BY } from '../../context/PowerBIFilter';
import { KeyInsightBox, PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { transformNewVsResaleSeries, logFetchDebug, assertKnownVersion } from '../../adapters';
import {
  SaleType,
  SaleTypeLabels,
  PremiumTrendLabels,
  isPremiumTrend,
  PropertyAgeBucket,
  PropertyAgeBucketLabels,
  NewVsResaleField,
  getNewVsResaleField,
} from '../../schemas/apiContract';

// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

// =============================================================================
// DEBUG LOGGING - Persistent logging to diagnose recurring empty resale line issue
// =============================================================================
const DEBUG_NEW_VS_RESALE = import.meta.env.DEV; // Only enable in development

function debugLog(stage, data) {
  if (!DEBUG_NEW_VS_RESALE) return;
  const timestamp = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console -- intentional debug utility
  console.warn(`[NewVsResale ${timestamp}] ${stage}:`, data);
}

function debugWarn(stage, data) {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.warn(`[NewVsResale ${timestamp}] ⚠️ ${stage}:`, data);
}

// Summary diagnostic - call this to get a quick status in console
// Usage: window.__debugNewVsResale?.()
if (typeof window !== 'undefined') {
  window.__debugNewVsResale = () => {
    /* eslint-disable no-console -- intentional debug utility for developers */
    console.warn('%c[NewVsResale] Debug enabled. Watch for these log stages:', 'color: blue; font-weight: bold');
    console.warn('  1. MOUNT - Component mounted with initial filters');
    console.warn('  2. API_PARAMS - Params being sent to API');
    console.warn('  3. API_RESPONSE - Raw response from backend');
    console.warn('  4. TRANSFORMED_DATA - After adapter transformation');
    console.warn('  5. CHART_ARRAYS - Final arrays for Chart.js');
    console.warn('  6. RENDER - Rendering decision');
    console.warn('%c⚠️ Watch for warnings: RESALE_DATA_MISSING, EMPTY_RESALE_LINE', 'color: orange');
    /* eslint-enable no-console */
  };
}

/**
 * New Sale vs Recently TOP (4-7 years age) Comparison Chart
 *
 * Dual-line time series showing:
 * - Line A (solid, navy): New Sale median total price
 * - Line B (dashed, blue): Recently TOP (4-7 years old) median total price
 *
 * Recently TOP definition:
 * - Property age (transaction year - lease start year) between 4 and 7 years (inclusive)
 * - Project must have at least one resale transaction (excludes delayed construction)
 *
 * RESPECTS GLOBAL SIDEBAR FILTERS (district, bedroom, segment, date range).
 * Only the drill level (year/quarter/month) is visual-local.
 *
 * Power BI Pattern: Global slicers MUST apply to ALL visuals.
 *
 * @param {{ height?: number }} props
 */
function NewVsResaleChartBase({ height = 350 }) {
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters, timeGrouping } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  const districts = filters.districts?.join(',') || '';
  const segments = filters.segments?.join(',') || '';

  // DEBUG: Log on mount
  useEffect(() => {
    debugLog('MOUNT', {
      initialFilters: {
        timeFilter: filters?.timeFilter,
        districts: filters?.districts?.length || 0,
        segments: filters?.segments?.length || 0,
      },
      timeGrouping,
    });
    return () => debugLog('UNMOUNT', { reason: 'Component unmounting' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chartRef = useRef(null);

  // Phase 4: Simplified data fetching - inline params, explicit query key
  const { data, status, error, isFetching, refetch } = useAppQuery(
    async (signal) => {
      // Inline params - no buildApiParams abstraction
      const params = {
        timeGrain: TIME_GROUP_BY[timeGrouping],
        timeframe,
        bedroom,
        district: districts,
        segment: segments,
      };

      // DEBUG: Log params being sent to API
      debugLog('API_PARAMS', {
        params,
        filterContext: {
          timeFilter: filters?.timeFilter,
          districts: filters?.districts,
          segments: filters?.segments,
          bedroomTypes: filters?.bedroomTypes,
        },
      });

      const response = await getNewVsResale(params, { signal });

      // DEBUG: Log raw API response
      const rawChartData = getNewVsResaleField(response.data, NewVsResaleField.CHART_DATA) || [];
      const resalePrices = rawChartData.map(r => r.resalePrice);
      const hasAnyResaleData = resalePrices.some(p => p !== null && p !== undefined);

      debugLog('API_RESPONSE', {
        status: response.status,
        totalPeriods: rawChartData.length,
        resalePricesWithData: resalePrices.filter(p => p !== null).length,
        hasAnyResaleData,
        sampleData: rawChartData.slice(0, 3),
        summary: getNewVsResaleField(response.data, NewVsResaleField.SUMMARY),
      });

      // CRITICAL WARNING: Log if resale data is completely missing
      if (rawChartData.length > 0 && !hasAnyResaleData) {
        debugWarn('RESALE_DATA_MISSING', {
          message: 'API returned chart data but ALL resalePrice values are null!',
          periods: rawChartData.map(r => r.period),
          resaleCounts: rawChartData.map(r => r.resaleCount),
          appliedFilters: getNewVsResaleField(response.data, NewVsResaleField.APPLIED_FILTERS),
        });
      }

      // Validate API contract version (dev/test only)
      // Pass response.data (API body with meta), not response (axios wrapper)
      assertKnownVersion(response.data, '/api/new-vs-resale');

      // Debug logging (dev only)
      logFetchDebug('NewVsResaleChart', {
        endpoint: '/api/new-vs-resale',
        timeGrain: timeGrouping,
        appliedFilters: getNewVsResaleField(response.data, NewVsResaleField.APPLIED_FILTERS),
        rowCount: rawChartData.length || 0,
      });

      // Use adapter for transformation
      const transformed = transformNewVsResaleSeries(response.data);

      // DEBUG: Log transformed data
      debugLog('TRANSFORMED_DATA', {
        chartDataLength: transformed.chartData?.length,
        hasData: transformed.hasData,
        resalePricesAfterTransform: transformed.chartData?.map(r => r.resalePrice),
        summary: transformed.summary,
      });

      return transformed;
    },
    // Explicit query key - TanStack handles cache deduplication
    ['new-vs-resale', timeframe, bedroom, districts, segments, timeGrouping],
    {
      chartName: 'NewVsResaleChart',
      initialData: null,  // null so hasRealData() returns false → shows skeleton during initial load
      keepPreviousData: true, // Instant filter updates - no loading flash
    }
  );

  // Default fallback for when data is null or missing expected properties
  // Use individual property defaults to handle edge cases where data exists but lacks expected fields
  const { chartData: rawChartData = [], summary = {}, hasData = false } = data ?? {};
  // Ensure chartData is always an array, even if API returns unexpected shape
  const chartData = Array.isArray(rawChartData) ? rawChartData : [];

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
    // FIX: Use segments (plural) not segment (singular) - matches context state
    if (filters?.segments?.length > 0) {
      parts.push(filters.segments.join(', '));
    }
    if (filters?.bedroomTypes?.length > 0 && filters.bedroomTypes.length < 5) {
      parts.push(`${filters.bedroomTypes.join(',')}BR`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'All data';
  };

  // Prepare chart data
  const labels = chartData.map(d => d.period);
  const newLaunchPrice = chartData.map(d => d.newLaunchPrice);
  const resalePrice = chartData.map(d => d.resalePrice);

  // Calculate data completeness for user awareness
  const resaleGaps = resalePrice.filter(v => v === null).length;
  const totalPoints = chartData.length;
  const resaleDataPoints = totalPoints - resaleGaps;
  const resaleCompleteness = totalPoints > 0 ? resaleDataPoints / totalPoints : 1;
  const hasSignificantGaps = resaleGaps > totalPoints * 0.2; // >20% gaps
  const isSeverelySparse = totalPoints > 0 && resaleCompleteness < 0.75; // <75% data completeness

  // DEBUG: Log chart data arrays
  if (DEBUG_NEW_VS_RESALE && chartData.length > 0) {
    const allResaleNull = resalePrice.every(v => v === null);
    const allNewNull = newLaunchPrice.every(v => v === null);

    debugLog('CHART_ARRAYS', {
      labels,
      newLaunchPrice,
      resalePrice,
      resaleGaps,
      resaleDataPoints,
      resaleCompleteness: `${Math.round(resaleCompleteness * 100)}%`,
      isSeverelySparse,
    });

    // Critical warning for empty lines
    if (allResaleNull) {
      debugWarn('EMPTY_RESALE_LINE', {
        message: 'Resale line will be EMPTY - all resalePrice values are null',
        totalPoints,
        chartDataSample: chartData.slice(0, 3),
      });
    }
    if (allNewNull) {
      debugWarn('EMPTY_NEW_SALE_LINE', {
        message: 'New Sale line will be EMPTY - all newLaunchPrice values are null',
        totalPoints,
      });
    }
  }

  const chartConfig = {
    labels,
    datasets: [
      {
        label: SaleTypeLabels[SaleType.NEW_SALE],
        data: newLaunchPrice,
        borderColor: '#213448',  // Deep Navy - primary palette color
        backgroundColor: 'rgba(33, 52, 72, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#213448',
        pointHoverBorderColor: '#fff',
        tension: 0.3,
        fill: false,
        spanGaps: true, // Connect line through null/missing data points
      },
      {
        label: PropertyAgeBucketLabels[PropertyAgeBucket.RECENTLY_TOP],
        data: resalePrice,
        borderColor: '#547792',  // Ocean Blue - secondary palette color
        backgroundColor: 'rgba(84, 119, 146, 0.1)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#547792',
        pointHoverBorderColor: '#fff',
        tension: 0.3,
        fill: false,
        spanGaps: true, // Connect line through null/missing data points
      },
    ],
  };

  const options = useMemo(() => ({
    ...baseChartJsOptions,
    // Smooth animation when data updates (filter changes)
    animation: {
      duration: 400, // Fast but visible transition
      easing: 'easeOutQuart',
    },
    transitions: {
      active: {
        animation: {
          duration: 200,
        },
      },
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
            return `${label}: $${value.toLocaleString()}`;
          },
          afterBody: (tooltipItems) => {
            const index = tooltipItems[0]?.dataIndex;
            if (index !== undefined && chartData[index]) {
              const dataPoint = chartData[index];
              const lines = [];

              // Show transaction counts for transparency
              if (dataPoint.newLaunchCount > 0) {
                lines.push(`New Sale: ${dataPoint.newLaunchCount} transactions`);
              }
              if (dataPoint.resaleCount > 0) {
                lines.push(`Resale: ${dataPoint.resaleCount} transactions`);
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
                lines.push('(No recently TOP 4-7yr data)');
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
          ...CHART_AXIS_DEFAULTS.ticks,
          maxRotation: 45,
          minRotation: 45,
          // Show fewer labels on mobile
          callback: function(value, index, _ticks) {
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
          ...CHART_AXIS_DEFAULTS.title,
        },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => `$${value.toLocaleString()}`,
        },
        grid: {
          color: 'rgba(148, 180, 193, 0.2)',
        },
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [timeGrouping]); // Options structure doesn't depend on chartData values; callbacks access via closure

  // Trend indicator icon - using palette colors
  const getTrendIcon = (trend) => {
    if (isPremiumTrend.widening(trend)) {
      return (
        <svg className="w-4 h-4 text-brand-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    }
    if (isPremiumTrend.narrowing(trend)) {
      return (
        <svg className="w-4 h-4 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      );
    }
    return null;
  };

  // Card layout: flex column with fixed height, header/note shrink-0, chart fills remaining
  // Add extra height when sparse warning is shown
  const cardHeight = height + 180 + (isSeverelySparse ? 60 : 0);

  // DEBUG: Log render decision
  debugLog('RENDER', {
    status,
    error: error?.message || null,
    hasData,
    chartDataLength: chartData.length,
    isFetching,
    willShowEmptyState: status === QueryStatus.SUCCESS && !hasData,
    willShowChart: status === QueryStatus.SUCCESS && hasData && chartData.length > 0,
  });

  // Debug info for QueryState empty state (visible via Ctrl+Shift+D)
  const debugInfo = useMemo(() => ({
    endpoint: '/api/new-vs-resale',
    params: {
      timeGrain: TIME_GROUP_BY[timeGrouping],
      districts: filters?.districts?.join(',') || null,
      segments: filters?.segments?.join(',') || null,
      bedroomTypes: filters?.bedroomTypes?.join(',') || null,
      timeFilter: filters?.timeFilter || null,
    },
    recordCount: chartData?.length || 0,
    warnings: isSeverelySparse ? ['Sparse resale data - some periods may be missing'] : [],
  }), [timeGrouping, filters, chartData?.length, isSeverelySparse]);

  return (
    <ChartFrame
      status={status}
      isFiltering={false}
      error={error}
      onRetry={refetch}
      empty={!hasData}
      skeleton="bar"
      height={350}
      debugInfo={debugInfo}
    >
      <div
        className="weapon-card hud-corner weapon-shadow overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
      {/* Header - shrink-0 */}
      <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-mono-muted shrink-0">
        <div className="min-w-0">
          <h3 className="font-semibold text-brand-navy text-sm md:text-base flex items-center gap-2">
            New Sale vs Recently TOP (4-7 yrs)
            {/* Subtle spinner when fetching new data in background */}
            {isFetching && (
              <span className="w-3 h-3 border-2 border-brand-blue/30 border-t-[#547792] rounded-full animate-spin" />
            )}
          </h3>
          <p className="text-xs text-brand-blue mt-0.5">
            {getFilterSummary()} · by {TIME_LABELS[timeGrouping].toLowerCase()}
            {hasSignificantGaps && (
              <span className="ml-2 text-amber-600">
                (sparse resale data)
              </span>
            )}
          </p>
        </div>

        {/* Premium KPIs */}
        <div className="flex flex-wrap gap-2 mt-3">
          {summary.currentPremium !== null && summary.currentPremium !== undefined && (
            <span className="px-3 py-1.5 rounded-full bg-brand-navy/10 text-brand-navy text-xs md:text-sm font-medium inline-flex items-center gap-1">
              Current: {summary.currentPremium > 0 ? '+' : ''}{summary.currentPremium}%
              {getTrendIcon(summary.premiumTrend)}
            </span>
          )}
          {summary.avgPremium10Y !== null && summary.avgPremium10Y !== undefined && (
            <span className="px-3 py-1.5 rounded-full bg-brand-sand/50 text-brand-blue text-xs md:text-sm">
              Period Avg: {summary.avgPremium10Y > 0 ? '+' : ''}{summary.avgPremium10Y}%
            </span>
          )}
          {summary.premiumTrend && !isPremiumTrend.stable(summary.premiumTrend) && (
            <span className={`px-3 py-1.5 rounded-full text-xs md:text-sm ${
              isPremiumTrend.widening(summary.premiumTrend)
                ? 'bg-brand-navy/10 text-brand-navy'
                : 'bg-brand-sky/30 text-brand-blue'
            }`}>
              {PremiumTrendLabels[summary.premiumTrend] || summary.premiumTrend}
            </span>
          )}
        </div>
      </div>

      {/* How to Interpret - shrink-0 */}
      <div className="shrink-0">
        <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
          Tracks the price gap between new launches and recently TOP units (4-7 years old) to highlight pricing discrepancies and relative value.
        </KeyInsightBox>
      </div>

      {/* Sparse Data Warning - shown when resale data is severely limited */}
      {isSeverelySparse && (
        <div className="shrink-0 mx-3 md:mx-4 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs text-amber-800">
              <span className="font-medium">Limited resale data</span>
              <span className="hidden sm:inline"> for this selection</span>
              {resaleDataPoints === 0 ? (
                <span>: No "Recently TOP (4-7 yrs)" transactions found. </span>
              ) : (
                <span>: Only {resaleDataPoints} of {totalPoints} periods ({Math.round(resaleCompleteness * 100)}%) have data. </span>
              )}
              <span className="text-amber-700">
                This bucket requires resales from properties aged 4-7 years, which may be rare for certain district/time combinations.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Chart slot - Chart.js handles data updates efficiently without key remount */}
      <ChartSlot>
        {chartData.length > 0 ? (
          <PreviewChartOverlay chartRef={chartRef}>
            <Line ref={chartRef} data={chartConfig} options={options} />
          </PreviewChartOverlay>
        ) : (
          <div className="flex items-center justify-center h-full text-brand-blue">
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
          <svg width="32" height="8">
            <line x1="0" y1="4" x2="32" y2="4" stroke="#213448" strokeWidth={2} />
          </svg>
          <span className="text-xs text-[#374151]">{SaleTypeLabels[SaleType.NEW_SALE]}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="32" height="8">
            <line x1="0" y1="4" x2="32" y2="4" stroke="#547792" strokeWidth={2} strokeDasharray="8 4" />
          </svg>
          <span className="text-xs text-[#374151]">{PropertyAgeBucketLabels[PropertyAgeBucket.RECENTLY_TOP]}</span>
        </div>
      </div>
      </div>
    </ChartFrame>
  );
}

export const NewVsResaleChart = React.memo(NewVsResaleChartBase);

export default NewVsResaleChart;
