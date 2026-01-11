import React, { useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery } from '../../hooks/useAppQuery';
import { ChartFrame } from '../common/ChartFrame';
// Chart.js components registered globally in chartSetup.js
import { Line } from 'react-chartjs-2';
import { getAggregate } from '../../api/client';
// Phase 3.2: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores/filterStore';
import { TIME_GROUP_BY } from '../../context/PowerBIFilter';
import { useSubscription } from '../../context/SubscriptionContext';
import {
  PreviewChartOverlay,
  DataCard,
  DataCardHeader,
  DataCardToolbar,
  ToolbarStat,
  DataCardCanvas,
  StatusDeck,
  StatusPeriod,
  StatusCount,
  LegendLine,
  AgentButton,
  AgentFooter,
} from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { CHART_COLORS } from '../../constants/colors';
import { REGION } from '../../constants/colors';
import {
  transformCompressionSeries,
  logFetchDebug,
  assertKnownVersion,
  validateResponseGrain,
} from '../../adapters';

// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

// Region colors from centralized colors.js
const REGION_COLORS = REGION;

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
 *  variant?: 'standalone' | 'dashboard',
 * }} props
 */
function AbsolutePsfChartBase({ height = 300, saleType = null, sharedData = null, sharedStatus = 'idle', staggerIndex = 0, variant = 'standalone' }) {
  // Derive layout flags from variant
  const isDashboard = variant === 'dashboard';
  const embedded = isDashboard;
  const cinema = isDashboard;
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters, timeGrouping } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  // district excluded - shows all regions for comparison
  const { isFreeResolved } = useSubscription();
  const chartRef = useRef(null);
  const [isAgentOpen, setIsAgentOpen] = useState(false);

  // Skip internal fetch if parent provides sharedData (eliminates duplicate API call)
  // Use loose equality to catch both null AND undefined (common when data hasn't arrived)
  const useSharedData = sharedData != null;

  // Visibility-based fetch deferral (CLAUDE.md Rule 5: Library-First)
  const { ref: containerRef, inView } = useInView({
    triggerOnce: false,
    rootMargin: '100px',
  });

  // Data fetching - skip if parent provides sharedData
  const { data: internalData, status: internalStatus, error, refetch } = useAppQuery(
    async (signal) => {
      // Phase 4: Inline params - no buildApiParams abstraction
      // Note: This chart always shows all regions for comparison (no segment/district filter)
      const params = {
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count',
        timeframe,
        bedroom,
        // segment excluded - shows all regions for comparison
        ...(saleType && { sale_type: saleType }),
      };

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
    // Explicit query key - TanStack handles cache deduplication
    ['absolute-psf', timeframe, bedroom, timeGrouping, saleType],
    { chartName: 'AbsolutePsfChart', initialData: null, enabled: inView && !useSharedData, keepPreviousData: true }
  );

  // Use shared data from parent if provided, otherwise use internal fetch
  // Default fallback for when data is null (initial load) - matches PriceDistributionChart pattern
  const data = (useSharedData ? sharedData : internalData) ?? [];
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
        pointHoverBorderColor: CHART_COLORS.white,
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
        pointHoverBorderColor: CHART_COLORS.white,
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
        pointHoverBorderColor: CHART_COLORS.white,
        pointHoverBorderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      },
    ],
  };

  // Chart options
  const chartOptions = {
    ...baseChartJsOptions,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },  // Using DataCardLegendDock instead
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
        grid: { color: CHART_COLORS.skyAlpha20 },
      },
    },
  };

  // CRITICAL: containerRef must be OUTSIDE ChartFrame for IntersectionObserver to work
  // ChartFrame only renders children when not in loading state, so ref would be null during load
  return (
    <div ref={containerRef}>
    <ChartFrame
      status={resolvedStatus}
      isFiltering={false}
      error={error}
      onRetry={refetch}
      empty={!data || data.length === 0}
      skeleton="line"
      height={height}
      staggerIndex={staggerIndex}
    >
      <DataCard variant={embedded ? 'embedded' : 'standalone'}>
        {/* Header: h-14 fixed with Agent button */}
        <DataCardHeader
          title="Absolute PSF by Region"
          logic="Median PSF over time. CCR = Core Central. RCR = Rest of Central. OCR = Outside Central."
          info={`Shows median PSF by region over time.
CCR = Core Central (Districts 9, 10, 11, downtown).
RCR = Rest of Central (city fringe).
OCR = Outside Central (suburban).`}
          controls={
            <AgentButton
              onClick={() => setIsAgentOpen(!isAgentOpen)}
              isActive={isAgentOpen}
            />
          }
        />

        {/* KPI Strip: h-20 fixed - Pure metrics only */}
        <DataCardToolbar columns={3} blur={isFreeResolved}>
          <ToolbarStat
            label="CCR"
            value={latestData.ccr != null ? `$${Math.round(latestData.ccr).toLocaleString()}` : '—'}
            subtext={ccrChange !== null ? `${ccrChange > 0 ? '+' : ''}${ccrChange}% vs prev` : undefined}
            trend={ccrChange > 0 ? 'up' : ccrChange < 0 ? 'down' : 'neutral'}
          />
          <ToolbarStat
            label="RCR"
            value={latestData.rcr != null ? `$${Math.round(latestData.rcr).toLocaleString()}` : '—'}
            subtext={rcrChange !== null ? `${rcrChange > 0 ? '+' : ''}${rcrChange}% vs prev` : undefined}
            trend={rcrChange > 0 ? 'up' : rcrChange < 0 ? 'down' : 'neutral'}
          />
          <ToolbarStat
            label="OCR"
            value={latestData.ocr != null ? `$${Math.round(latestData.ocr).toLocaleString()}` : '—'}
            subtext={ocrChange !== null ? `${ocrChange > 0 ? '+' : ''}${ocrChange}% vs prev` : undefined}
            trend={ocrChange > 0 ? 'up' : ocrChange < 0 ? 'down' : 'neutral'}
          />
        </DataCardToolbar>

        {/* Canvas: flex-grow */}
        <DataCardCanvas minHeight={height} cinema={cinema}>
          <PreviewChartOverlay chartRef={chartRef}>
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </PreviewChartOverlay>
        </DataCardCanvas>

        {/* Status Deck: h-10 fixed - Left: periods | Center: legend | Right: txns */}
        <StatusDeck
          left={<StatusPeriod>{data.length} Periods ({TIME_LABELS[timeGrouping]})</StatusPeriod>}
          right={
            latestData.counts
              ? <StatusCount count={(latestData.counts.CCR || 0) + (latestData.counts.RCR || 0) + (latestData.counts.OCR || 0)} />
              : null
          }
        >
          <LegendLine label="CCR" color={REGION_COLORS.CCR} />
          <LegendLine label="RCR" color={REGION_COLORS.RCR} />
          <LegendLine label="OCR" color={REGION_COLORS.OCR} />
        </StatusDeck>

        {/* Agent Analysis - expandable on-demand */}
        <AgentFooter isOpen={isAgentOpen}>
          {ccrChange > 0 && rcrChange > 0 && ocrChange > 0
            ? 'All regions showing positive momentum. Market-wide appreciation detected.'
            : ccrChange > rcrChange && rcrChange > ocrChange
            ? 'Premium outperformance pattern. CCR leading gains suggests flight-to-quality.'
            : ocrChange > rcrChange && rcrChange > ccrChange
            ? 'Suburban catch-up detected. OCR outpacing core regions - compression signal.'
            : 'Mixed signals across regions. Monitor for trend confirmation.'}
        </AgentFooter>
      </DataCard>
    </ChartFrame>
    </div>
  );
}

export const AbsolutePsfChart = React.memo(AbsolutePsfChartBase);

export default AbsolutePsfChart;
