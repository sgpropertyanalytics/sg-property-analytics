import React, { useRef } from 'react';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery, useDeferredFetch } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
// Chart.js components registered globally in chartSetup.js
import { Line } from 'react-chartjs-2';
import { getAggregate } from '../../api/client';
// Phase 3.2: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores';
import { TIME_GROUP_BY } from '../../context/PowerBIFilter';
import { useSubscription } from '../../context/SubscriptionContext';
import { PreviewChartOverlay, ChartSlot, InlineCard, InlineCardRow } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import {
  transformCompressionSeries,
  logFetchDebug,
  assertKnownVersion,
  validateResponseGrain,
} from '../../adapters';

// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

// Region colors (consistent with brand)
const REGION_COLORS = {
  CCR: '#213448',
  RCR: '#547792',
  OCR: '#94B4C1',
};

/**
 * Absolute PSF by Region Chart
 *
 * Shows the absolute median PSF values for CCR, RCR, and OCR over time.
 * This provides context for understanding the spread analysis in the
 * Market Compression chart.
 *
 * RESPECTS GLOBAL SIDEBAR FILTERS (district, bedroom, segment, date range).
 *
 * @param {{
 *  height?: number,
 *  saleType?: string | null,
 *  sharedData?: Array<Record<string, any>> | null,
 *  sharedStatus?: string,
 * }} props
 */
function AbsolutePsfChartBase({ height = 300, saleType = null, sharedData = null, sharedStatus = 'idle' }) {
  const { buildApiParams, debouncedFilterKey, filterKey, timeGrouping } = useZustandFilters();
  const { isPremium, isFreeResolved } = useSubscription();
  const chartRef = useRef(null);

  // Skip internal fetch if parent provides sharedData (eliminates duplicate API call)
  // Use loose equality to catch both null AND undefined (common when data hasn't arrived)
  const useSharedData = sharedData != null;

  // Defer fetch until chart is visible (low priority - below the fold)
  // IMPORTANT: filterKey must include ALL state that affects the query data
  // timeGrouping changes the aggregation, so it's part of the query key
  const { shouldFetch, containerRef } = useDeferredFetch({
    filterKey: `${debouncedFilterKey}:${timeGrouping}`,
    priority: 'low',
    fetchOnMount: false,
  });

  // Data fetching - same as PriceCompressionChart for consistency
  // Skip if parent provides sharedData (W4 fix: eliminates duplicate API call with PriceCompressionChart)
  const { data: internalData, status: internalStatus, error, refetch } = useAppQuery(
    async (signal) => {
      // saleType is passed from page level - see CLAUDE.md "Business Logic Enforcement"
      // Exclude segment filter - this chart always shows all regions for comparison
      const params = buildApiParams({
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count',
        ...(saleType && { sale_type: saleType }),
      }, { excludeOwnDimension: 'segment' });

      const response = await getAggregate(params, { signal, priority: 'low' });
      assertKnownVersion(response.data, '/api/aggregate');

      const rawData = response.data || [];
      logFetchDebug('AbsolutePsfChart', {
        endpoint: '/api/aggregate',
        timeGrain: timeGrouping,
        response: response.data,
        rowCount: rawData.length,
      });

      // Validate grain at fetch boundary (dev-only, on success)
      validateResponseGrain(rawData, timeGrouping, 'AbsolutePsfChart');

      // Transform is grain-agnostic - trusts data's own periodGrain
      return transformCompressionSeries(rawData);
    },
    [debouncedFilterKey, timeGrouping, saleType],
    { chartName: 'AbsolutePsfChart', initialData: [], enabled: shouldFetch && !useSharedData, keepPreviousData: true }
  );

  // Use shared data from parent if provided, otherwise use internal fetch
  const data = useSharedData ? sharedData : internalData;
  // Use shared status directly when in shared mode
  const resolvedStatus = useSharedData ? sharedStatus : internalStatus;

  // Latest values for KPI display
  const latestData = data[data.length - 1] || {};
  const prevData = data[data.length - 2] || {};

  // Calculate period-over-period changes
  const ccrChange = latestData.ccr && prevData.ccr
    ? Math.round(((latestData.ccr - prevData.ccr) / prevData.ccr) * 100 * 10) / 10
    : null;
  const rcrChange = latestData.rcr && prevData.rcr
    ? Math.round(((latestData.rcr - prevData.rcr) / prevData.rcr) * 100 * 10) / 10
    : null;
  const ocrChange = latestData.ocr && prevData.ocr
    ? Math.round(((latestData.ocr - prevData.ocr) / prevData.ocr) * 100 * 10) / 10
    : null;

  // Chart data
  const chartData = {
    labels: data.map(d => d.period),
    datasets: [
      {
        label: 'CCR (Core Central)',
        data: data.map(d => d.ccr),
        borderColor: REGION_COLORS.CCR,
        backgroundColor: REGION_COLORS.CCR,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: REGION_COLORS.CCR,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      },
      {
        label: 'RCR (Rest of Central)',
        data: data.map(d => d.rcr),
        borderColor: REGION_COLORS.RCR,
        backgroundColor: REGION_COLORS.RCR,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: REGION_COLORS.RCR,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      },
      {
        label: 'OCR (Outside Central)',
        data: data.map(d => d.ocr),
        borderColor: REGION_COLORS.OCR,
        backgroundColor: REGION_COLORS.OCR,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: REGION_COLORS.OCR,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      },
    ],
  };

  // Card layout: flex column with fixed height (must match PriceCompressionChart for grid alignment)
  const cardHeight = height + 200;

  // Chart options
  const chartOptions = {
    ...baseChartJsOptions,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 6,
          boxHeight: 6,
          padding: 15,
          font: { size: 11 },
          generateLabels: (chart) => {
            return chart.data.datasets.map((dataset, i) => ({
              text: dataset.label,
              fillStyle: dataset.backgroundColor,
              strokeStyle: dataset.backgroundColor,
              lineWidth: 0,
              pointStyle: 'circle',
              hidden: !chart.isDatasetVisible(i),
              datasetIndex: i,
            }));
          },
        },
      },
      tooltip: {
        callbacks: {
          title: (items) => `${items[0].label}`,
          label: (context) => {
            const value = context.parsed.y;
            const label = context.dataset.label;
            return `${label}: $${Math.round(value).toLocaleString()} PSF`;
          },
          afterBody: (items) => {
            const idx = items[0]?.dataIndex;
            if (idx !== undefined && data[idx]) {
              const d = data[idx];
              const lines = [];
              if (d.counts?.CCR) lines.push(`CCR: ${d.counts.CCR} transactions`);
              if (d.counts?.RCR) lines.push(`RCR: ${d.counts.RCR} transactions`);
              if (d.counts?.OCR) lines.push(`OCR: ${d.counts.OCR} transactions`);
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
        },
      },
      y: {
        title: { display: true, text: 'Median PSF ($)', ...CHART_AXIS_DEFAULTS.title },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (v) => `$${v.toLocaleString()}`,
        },
        grid: { color: 'rgba(148, 180, 193, 0.2)' },
      },
    },
  };

  // CRITICAL: containerRef must be OUTSIDE ChartFrame for IntersectionObserver to work
  // ChartFrame only renders children when not in loading state, so ref would be null during load
  return (
    <div ref={containerRef}>
    <ChartFrame
      status={resolvedStatus}
      isFiltering={filterKey !== debouncedFilterKey}
      error={error}
      onRetry={refetch}
      empty={!data || data.length === 0}
      skeleton="line"
      height={height}
    >
      <div
        className="bg-card rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
        {/* Header */}
        <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[#94B4C1]/30 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-[#213448] text-sm md:text-base">
                Absolute PSF by Region
              </h3>
              <p className="text-xs text-[#547792] mt-0.5">
                Median PSF trend ({TIME_LABELS[timeGrouping]}) • Values show latest {TIME_LABELS[timeGrouping].toLowerCase()}
              </p>
            </div>
          </div>

          {/* KPI Row - Using standardized InlineCard components */}
          <InlineCardRow blur={isFreeResolved}>
            {latestData.ccr != null && (
              <InlineCard
                label="CCR"
                value={`$${Math.round(latestData.ccr).toLocaleString()}`}
                subtext={ccrChange !== null ? `${ccrChange > 0 ? '+' : ''}${ccrChange}% vs prev` : undefined}
                color={REGION_COLORS.CCR}
                trend={ccrChange > 0 ? 'up' : ccrChange < 0 ? 'down' : 'neutral'}
              />
            )}
            {latestData.rcr != null && (
              <InlineCard
                label="RCR"
                value={`$${Math.round(latestData.rcr).toLocaleString()}`}
                subtext={rcrChange !== null ? `${rcrChange > 0 ? '+' : ''}${rcrChange}% vs prev` : undefined}
                color={REGION_COLORS.RCR}
                trend={rcrChange > 0 ? 'up' : rcrChange < 0 ? 'down' : 'neutral'}
              />
            )}
            {latestData.ocr != null && (
              <InlineCard
                label="OCR"
                value={`$${Math.round(latestData.ocr).toLocaleString()}`}
                subtext={ocrChange !== null ? `${ocrChange > 0 ? '+' : ''}${ocrChange}% vs prev` : undefined}
                color={REGION_COLORS.OCR}
                trend={ocrChange > 0 ? 'up' : ocrChange < 0 ? 'down' : 'neutral'}
              />
            )}
          </InlineCardRow>
        </div>

        {/* Chart Area */}
        {/* ChartFrame handles empty state, so we always render the chart here */}
        <ChartSlot>
          <PreviewChartOverlay chartRef={chartRef}>
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </PreviewChartOverlay>
        </ChartSlot>

        {/* Footer */}
        <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
          <span className="truncate">{data.length} periods</span>
          <span className="text-[10px]">
            {latestData.counts
              ? `${(latestData.counts.CCR || 0) + (latestData.counts.RCR || 0) + (latestData.counts.OCR || 0)} total txns`
              : ''}
          </span>
        </div>
      </div>
    </ChartFrame>
    </div>
  );
}

export const AbsolutePsfChart = React.memo(AbsolutePsfChartBase);

export default AbsolutePsfChart;
