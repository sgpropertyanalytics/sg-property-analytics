import React, { useRef, useMemo } from 'react';
import { useInView } from 'react-intersection-observer';
import { useDebounce } from 'use-debounce';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
// Chart.js components registered globally in chartSetup.js
import { Line } from 'react-chartjs-2';
import { getAggregate } from '../../api/client';
// Phase 3.2: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores';
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
  LegendLine,
} from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS, CHART_TOOLTIP } from '../../constants/chartOptions';
import { CHART_COLORS } from '../../constants/colors';
import {
  transformCompressionSeries,
  calculateCompressionScore,
  calculateHistoricalBaseline,
  calculateAverageSpreads,
  logFetchDebug,
  assertKnownVersion,
  validateResponseGrain,
} from '../../adapters';

// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

/**
 * Price Compression Analysis Chart
 *
 * Shows the spread between market segments (CCR-RCR and RCR-OCR) over time.
 * - Compression (narrowing spreads) = suburban catching up, broad market strength
 * - Expansion (widening spreads) = flight to quality, premium outperformance
 *
 * Features:
 * - Compression Score (0-100): 100 = tight (at historical min), 0 = wide (at historical max)
 * - UI Chips: Current spread values with period-over-period change
 * - Auto-annotations: Breakout (>10% from 6M baseline) and Reversion (within 5% of median)
 * - Sparkline: Mini trend of combined spread
 * - Local drill: Year → Quarter → Month (visual-local only)
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
function PriceCompressionChartBase({ height = 380, saleType = null, sharedData = null, sharedStatus = 'idle', staggerIndex = 0, variant = 'standalone' }) {
  // Derive layout flags from variant
  const isDashboard = variant === 'dashboard';
  const embedded = isDashboard;
  const cinema = isDashboard;
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters, timeGrouping } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';

  // Debounce filter values for smoother UX (prevents rapid API calls during filter changes)
  const [debouncedBedroom] = useDebounce(bedroom, 300);

  // district excluded - shows all regions for comparison
  const { tier, tierSource } = useSubscription();
  const isFreeTier = tierSource !== 'none' && tier === 'free';

  // UI state (not data state - that comes from useAbortableQuery)
  const chartRef = useRef(null);

  // Skip internal fetch if parent provides sharedData (eliminates duplicate API call)
  // Use loose equality to catch both null AND undefined (common when data hasn't arrived)
  const useSharedData = sharedData != null;

  // Visibility-based fetch deferral (CLAUDE.md Rule 5: Library-First)
  const { ref: containerRef, inView } = useInView({
    triggerOnce: false,
    rootMargin: '100px',
  });

  // HISTORICAL BASELINE: Fetch full historical data once (no date filters)
  // This provides stable min/max for compression score calculation
  // Uses quarterly grain for efficiency - baseline doesn't need fine-grained time
  const { data: baselineData } = useAppQuery(
    async (signal) => {
      // No date filters, no highlights - full historical data
      const params = {
        group_by: 'quarter,region',
        metrics: 'median_psf,count',
      };

      const response = await getAggregate(params, { signal, priority: 'low' });
      const rawData = response.data || [];
      // Transform is grain-agnostic - trusts data's own periodGrain
      const transformed = transformCompressionSeries(rawData);
      return calculateHistoricalBaseline(transformed);
    },
    ['priceCompressionBaseline'], // Explicit key to avoid collision with other fetch-once queries
    { chartName: 'PriceCompressionChart-baseline', initialData: null, enabled: inView, keepPreviousData: true }
  );

  // Default fallback for baseline data (initial load) - matches main query pattern
  const safeBaselineData = baselineData ?? { min: 0, max: 1000 };

  // Data fetching - skip if parent provides sharedData
  const { data: internalData, status: internalStatus, error, refetch } = useAppQuery(
    async (signal) => {
      // Phase 4: Inline params - no buildApiParams abstraction
      // Note: This chart always shows all regions for comparison (no segment/district filter)
      const params = {
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count',
        timeframe,
        bedroom: debouncedBedroom,  // Use debounced value for smoother UX
        // segment excluded - shows all regions for comparison
        ...(saleType && { sale_type: saleType }),
      };

      const response = await getAggregate(params, { signal, priority: 'low' });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/aggregate');

      const rawData = response.data || [];

      // Debug logging (dev only)
      logFetchDebug('PriceCompressionChart', {
        endpoint: '/api/aggregate',
        timeGrain: timeGrouping,
        response: response.data,
        rowCount: rawData.length,
      });

      // Validate grain at fetch boundary (dev-only, on success)
      validateResponseGrain(rawData, timeGrouping, 'PriceCompressionChart');

      // Use adapter for transformation - centralizes all data munging
      // Transform is grain-agnostic - trusts data's own periodGrain
      return transformCompressionSeries(rawData);
    },
    // Explicit query key - uses debounced bedroom for stable cache key
    ['price-compression', timeframe, debouncedBedroom, timeGrouping, saleType],
    { chartName: 'PriceCompressionChart', initialData: null, enabled: inView && !useSharedData, keepPreviousData: true }
  );

  // Use shared data from parent if provided, otherwise use internal fetch
  // Default fallback for when data is null (initial load) - matches PriceDistributionChart pattern
  const data = (useSharedData ? sharedData : internalData) ?? [];
  // Use shared status directly when in shared mode
  const resolvedStatus = useSharedData ? sharedStatus : internalStatus;


  // Computed values - use historical baseline for stable min/max
  const compressionScore = useMemo(
    () => calculateCompressionScore(data, safeBaselineData),
    [data, safeBaselineData]
  );
  const averageSpreads = useMemo(() => calculateAverageSpreads(data), [data]);
  const latestData = data[data.length - 1] || {};

  // Chart data for spread lines - simple, clean colors
  const spreadChartData = {
    labels: data.map(d => d.period),
    datasets: [
      {
        label: 'CCR-RCR Spread',
        data: data.map(d => d.ccrRcrSpread),
        borderColor: CHART_COLORS.navy, // Navy
        backgroundColor: CHART_COLORS.navyDeepAlpha10,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: CHART_COLORS.navy,
        pointHoverBorderColor: CHART_COLORS.white,
        pointHoverBorderWidth: 2,
        fill: false,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'RCR-OCR Spread',
        data: data.map(d => d.rcrOcrSpread),
        borderColor: CHART_COLORS.ocean, // Ocean blue
        backgroundColor: CHART_COLORS.oceanAlpha10,
        borderWidth: 2.5,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: CHART_COLORS.ocean,
        pointHoverBorderColor: CHART_COLORS.white,
        pointHoverBorderWidth: 2,
        fill: false,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  };

  // Chart options with annotations
  const spreadChartOptions = {
    ...baseChartJsOptions,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...CHART_TOOLTIP,
        callbacks: {
          title: (items) => `${items[0].label}`,
          label: (context) => {
            const idx = context.dataIndex;
            const d = data[idx];
            if (!d) return '';
            if (context.datasetIndex === 0) {
              return `CCR-RCR: $${d.ccrRcrSpread?.toLocaleString() || '-'} PSF`;
            }
            return `RCR-OCR: $${d.rcrOcrSpread?.toLocaleString() || '-'} PSF`;
          },
          afterBody: (items) => {
            const idx = items[0]?.dataIndex;
            if (idx !== undefined && data[idx]) {
              const d = data[idx];
              const lines = [];
              if (d.ccr) lines.push(`CCR: $${Math.round(d.ccr).toLocaleString()} PSF (${d.counts?.CCR || 0} transactions)`);
              if (d.rcr) lines.push(`RCR: $${Math.round(d.rcr).toLocaleString()} PSF (${d.counts?.RCR || 0} transactions)`);
              if (d.ocr) lines.push(`OCR: $${Math.round(d.ocr).toLocaleString()} PSF (${d.counts?.OCR || 0} transactions)`);
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
        title: { display: true, text: 'Spread ($/PSF)', ...CHART_AXIS_DEFAULTS.title },
        beginAtZero: false,
        grace: '10%',
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (v) => `$${v.toLocaleString()}`,
        },
        grid: { color: CHART_COLORS.skyAlpha20 },
      },
    },
  };

  // CRITICAL: containerRef must be OUTSIDE ChartFrame for IntersectionObserver to work
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
        {/* Header: h-14 fixed */}
        <DataCardHeader
          title="Market Compression Analysis"
          logic="Spreads narrowing = suburban catching up. Widening = prime outperforming."
          info={`Spreads narrowing = suburban catching up (compression).
Spreads widening = prime outperforming (fragmentation).
Watch for lines dipping below $0 — that's a price inversion anomaly.`}
        />

        {/* Toolbar: h-20 fixed - 3 columns for score + spreads */}
        <DataCardToolbar columns={3} blur={isFreeTier}>
          <ToolbarStat
            label="Compression Score"
            value={
              <span className={
                compressionScore.score >= 60 ? 'text-emerald-600' :
                compressionScore.score >= 40 ? 'text-amber-600' :
                'text-red-600'
              }>
                {compressionScore.score}
              </span>
            }
            subtext={
              compressionScore.score >= 60 ? 'tight' :
              compressionScore.score >= 40 ? 'moderate' :
              'wide'
            }
          />
          <ToolbarStat
            label="CCR > RCR Premium"
            value={latestData.ccrRcrSpread != null ? `+$${latestData.ccrRcrSpread.toLocaleString()} PSF` : '—'}
            subtext={averageSpreads.ccrRcr ? `${Math.round(((latestData.ccrRcrSpread - averageSpreads.ccrRcr) / Math.abs(averageSpreads.ccrRcr)) * 100)}% vs avg` : undefined}
            trend={latestData.ccrRcrSpread > averageSpreads.ccrRcr ? 'up' : latestData.ccrRcrSpread < averageSpreads.ccrRcr ? 'down' : 'neutral'}
          />
          <ToolbarStat
            label="RCR > OCR Premium"
            value={latestData.rcrOcrSpread != null ? `+$${latestData.rcrOcrSpread.toLocaleString()} PSF` : '—'}
            subtext={averageSpreads.rcrOcr ? `${Math.round(((latestData.rcrOcrSpread - averageSpreads.rcrOcr) / Math.abs(averageSpreads.rcrOcr)) * 100)}% vs avg` : undefined}
            trend={latestData.rcrOcrSpread > averageSpreads.rcrOcr ? 'up' : latestData.rcrOcrSpread < averageSpreads.rcrOcr ? 'down' : 'neutral'}
          />
        </DataCardToolbar>

        {/* Canvas: flex-grow */}
        <DataCardCanvas minHeight={height} cinema={cinema}>
          <PreviewChartOverlay chartRef={chartRef}>
            <Line ref={chartRef} data={spreadChartData} options={spreadChartOptions} />
          </PreviewChartOverlay>
        </DataCardCanvas>

        {/* Status Deck: h-10 fixed - Left: periods | Center: legend | Right: empty */}
        <StatusDeck
          left={<StatusPeriod>{data.length} Periods ({TIME_LABELS[timeGrouping]})</StatusPeriod>}
        >
          <LegendLine label="CCR-RCR Spread" color={CHART_COLORS.navy} />
          <LegendLine label="RCR-OCR Spread" color={CHART_COLORS.ocean} lineStyle="dashed" />
        </StatusDeck>
      </DataCard>
    </ChartFrame>
    </div>
  );
}

export const PriceCompressionChart = React.memo(PriceCompressionChartBase);

export default PriceCompressionChart;
