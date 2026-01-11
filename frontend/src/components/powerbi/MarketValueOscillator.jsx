import React, { useMemo, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
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
  LegendLine,
} from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { CHART_COLORS } from '../../constants/colors';
import {
  transformOscillatorSeries,
  calculateZScoreStats,
  getZScoreLabel,
  getZScoreColor,
  transformCompressionSeries,
  logFetchDebug,
  assertKnownVersion,
  validateResponseGrain,
  DEFAULT_BASELINE_STATS,
} from '../../adapters';

// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

/**
 * Market Value Oscillator Chart
 *
 * Uses Z-score normalization to show valuation signals for CCR-RCR and RCR-OCR spreads.
 * Z-Score = (current - mean) / stdDev
 *
 * Visual zones:
 * - Above +1σ (red zone): Historically overvalued
 * - Below -1σ (green zone): Historically undervalued
 * - Between ±0.5σ (white): Fair value
 *
 * RESPECTS GLOBAL SIDEBAR FILTERS (district, bedroom, segment, date range).
 *
 * SHARED DATA OPTIMIZATION (P0 performance fix):
 * - Accepts sharedRawData from parent (MacroOverview) to eliminate duplicate aggregate request
 * - The same region/time aggregate data is used by compression charts and this oscillator
 *
 * @param {{
 *  height?: number,
 *  saleType?: string | null,
 *  sharedRawData?: Array<Record<string, any>> | null,
 *  sharedStatus?: string,
 *  variant?: 'standalone' | 'dashboard',
 * }} props
 */
function MarketValueOscillatorBase({ height = 420, saleType = null, sharedRawData = null, sharedStatus = 'idle', staggerIndex = 0, variant = 'standalone' }) {
  // Derive layout flags from variant
  const isDashboard = variant === 'dashboard';
  const embedded = isDashboard;
  const cinema = isDashboard;
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters, timeGrouping } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  const { isFreeResolved } = useSubscription();

  const chartRef = useRef(null);

  // Visibility-based fetch deferral (CLAUDE.md Rule 5: Library-First)
  const { ref: containerRef, inView } = useInView({
    triggerOnce: false,
    rootMargin: '100px',
  });

  // HISTORICAL BASELINE: Fetch full historical data (no date filters)
  // This provides stable mean/stdDev for Z-score calculation
  // Uses page-level saleType prop - page owns business logic decision
  // See CLAUDE.md "Layer Responsibilities" - components render props, never decide defaults
  const { data: baselineStats } = useAppQuery(
    async (signal) => {
      const params = {
        group_by: 'quarter,region',
        metrics: 'median_psf,count',
        sale_type: saleType,
      };

      const response = await getAggregate(params, { signal, priority: 'low' });
      const rawData = response.data || [];
      // Transform is grain-agnostic - trusts data's own periodGrain
      const compressionData = transformCompressionSeries(rawData);
      return calculateZScoreStats(compressionData);
    },
    [saleType], // Refetch if saleType changes (rare - usually constant from page)
    {
      chartName: 'MarketValueOscillator-baseline',
      initialData: null,
      enabled: inView,
      keepPreviousData: true,
    }
  );

  // Fallback to conservative defaults until real baseline loads (see DEFAULT_BASELINE_STATS JSDoc)
  const safeBaselineStats = baselineStats ?? DEFAULT_BASELINE_STATS;

  // Determine if we should use shared data from parent (P0 performance fix)
  // When sharedRawData is provided, we skip the internal fetch entirely
  // Use loose equality to catch both null AND undefined (common when data hasn't arrived)
  const useShared = sharedRawData != null;

  // Main filtered data fetching - uses page-level saleType prop
  // DISABLED when sharedRawData is provided (eliminates duplicate request)
  const { data: fetchedData, status: fetchStatus, error, refetch } = useAppQuery(
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

      // Validate API contract version
      assertKnownVersion(response.data, '/api/aggregate');

      const rawData = response.data || [];

      logFetchDebug('MarketValueOscillator', {
        endpoint: '/api/aggregate',
        timeGrain: timeGrouping,
        response: response.data,
        rowCount: rawData.length,
      });

      // Validate grain at fetch boundary (dev-only, on success)
      validateResponseGrain(rawData, timeGrouping, 'MarketValueOscillator');

      // Transform to Z-scores using historical baseline
      // Transform is grain-agnostic - trusts data's own periodGrain
      return transformOscillatorSeries(rawData, safeBaselineStats);
    },
    // Explicit query key - TanStack handles cache deduplication
    ['market-oscillator', timeframe, bedroom, timeGrouping, safeBaselineStats, saleType],
    { chartName: 'MarketValueOscillator', initialData: null, enabled: inView && !useShared, keepPreviousData: true }
  );

  // When using shared data, transform it with useMemo (same transform as internal fetch)
  // Transform is grain-agnostic - trusts data's own periodGrain
  const sharedTransformedData = useMemo(() => {
    if (!useShared || !sharedRawData || sharedRawData.length === 0) return [];
    return transformOscillatorSeries(sharedRawData, safeBaselineStats);
  }, [useShared, sharedRawData, safeBaselineStats]);

  // Use shared data when available, otherwise use fetched data
  // Default fallback for when data is null (initial load) - matches PriceDistributionChart pattern
  const data = (useShared ? sharedTransformedData : fetchedData) ?? [];
  const status = useShared ? sharedStatus : fetchStatus;

  // Get latest values for KPI cards
  const latestData = data[data.length - 1] || {};
  const latestZCcrRcr = latestData.zCcrRcr;
  const latestZRcrOcr = latestData.zRcrOcr;

  // Calculate divergence between the two Z-scores
  // FIX: Use == null to catch both null AND undefined (prevents NaN/"NaNo" display)
  const divergence = useMemo(() => {
    if (latestZCcrRcr == null || latestZRcrOcr == null) return null;
    return latestZCcrRcr - latestZRcrOcr;
  }, [latestZCcrRcr, latestZRcrOcr]);

  // Calculate dynamic Y-axis bounds based on actual data
  const yAxisBounds = useMemo(() => {
    const allZScores = [
      ...data.map(d => d.zCcrRcr),
      ...data.map(d => d.zRcrOcr),
    ].filter(v => v !== null && !isNaN(v));

    if (allZScores.length === 0) return { min: -2.5, max: 2.5 };

    const minZ = Math.min(...allZScores);
    const maxZ = Math.max(...allZScores);

    // Round to nearest 0.5 with some padding
    const roundedMin = Math.floor(minZ * 2) / 2 - 0.5;
    const roundedMax = Math.ceil(maxZ * 2) / 2 + 0.5;

    // Ensure symmetric range around 0 for balanced visual
    const absMax = Math.max(Math.abs(roundedMin), Math.abs(roundedMax));
    return {
      min: -absMax,
      max: absMax,
    };
  }, [data]);

  // Chart data
  const chartData = {
    labels: data.map(d => d.period),
    datasets: [
      {
        label: 'CCR-RCR Z-Score',
        data: data.map(d => d.zCcrRcr),
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
        label: 'RCR-OCR Z-Score',
        data: data.map(d => d.zRcrOcr),
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

  // Chart options with gradient zone annotations
  const chartOptions = {
    ...baseChartJsOptions,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => `${items[0].label}`,
          label: (context) => {
            const idx = context.dataIndex;
            const d = data[idx];
            const z = context.parsed.y;

            if (!d) return '';

            const signal = getZScoreLabel(z);

            if (context.datasetIndex === 0) {
              const deviation = d.ccrRcrSpread - safeBaselineStats.ccrRcr.mean;
              return [
                `CCR-RCR: ${z?.toFixed(2) || 'N/A'}σ (${signal})`,
                `Current: $${d.ccrRcrSpread?.toLocaleString() || 'N/A'} PSF`,
                `${deviation >= 0 ? '+' : ''}$${Math.round(deviation)} vs avg ($${Math.round(safeBaselineStats.ccrRcr.mean)})`,
              ];
            }
            // RCR-OCR
            const deviation = d.rcrOcrSpread - safeBaselineStats.rcrOcr.mean;
            return [
              `RCR-OCR: ${z?.toFixed(2) || 'N/A'}σ (${signal})`,
              `Current: $${d.rcrOcrSpread?.toLocaleString() || 'N/A'} PSF`,
              `${deviation >= 0 ? '+' : ''}$${Math.round(deviation)} vs avg ($${Math.round(safeBaselineStats.rcrOcr.mean)})`,
            ];
          },
        },
      },
      annotation: {
        annotations: {
          // Extreme overvalued zone (dark red) - beyond +2σ
          extremeOvervaluedZone: {
            type: 'box',
            yMin: 2.0,
            yMax: yAxisBounds.max,
            backgroundColor: CHART_COLORS.redAlpha20,
            borderWidth: 0,
          },
          // Elevated zone (light red) - +1σ to +2σ
          elevatedZone: {
            type: 'box',
            yMin: 1.0,
            yMax: 2.0,
            backgroundColor: CHART_COLORS.redAlpha08,
            borderWidth: 0,
          },
          // Normal zone (grey) - between -1σ and +1σ
          normalZone: {
            type: 'box',
            yMin: -1.0,
            yMax: 1.0,
            backgroundColor: CHART_COLORS.skyAlpha15,
            borderWidth: 0,
          },
          // Compressed zone (light green) - -2σ to -1σ
          compressedZone: {
            type: 'box',
            yMin: -2.0,
            yMax: -1.0,
            backgroundColor: CHART_COLORS.emeraldAlpha08,
            borderWidth: 0,
          },
          // Extreme undervalued zone (dark green) - beyond -2σ
          extremeUndervaluedZone: {
            type: 'box',
            yMin: yAxisBounds.min,
            yMax: -2.0,
            backgroundColor: CHART_COLORS.emeraldAlpha20,
            borderWidth: 0,
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
        beginAtZero: false,
        grace: '10%',
        title: { display: true, text: 'Z-Score (σ)', ...CHART_AXIS_DEFAULTS.title },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (v) => v === 0 ? '0' : `${v > 0 ? '+' : ''}${v}σ`,
          stepSize: 1,
        },
        grid: { display: false },
      },
    },
  };

  // CRITICAL: containerRef must be OUTSIDE ChartFrame for IntersectionObserver to work
  return (
    <div ref={containerRef}>
      <ChartFrame
        status={status}
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
            title="Market Value Oscillator"
            logic="Z-score measures how far current spreads deviate from historical norms."
            info={`Z-score measures how far current spreads deviate from historical norms.
Based on resale transactions only, with outliers excluded.
±0σ to ±1.0σ = Normal range | +1.0σ to +2.0σ = Elevated | > +2.0σ = Extreme`}
          />

          {/* KPI Row - using standard DataCardToolbar */}
          <DataCardToolbar columns={3} blur={isFreeResolved}>
            <ToolbarStat
              label="CCR-RCR Signal"
              value={
                latestZCcrRcr != null ? (
                  <span className={getZScoreColor(latestZCcrRcr)}>
                    {latestZCcrRcr >= 0 ? '+' : ''}{latestZCcrRcr.toFixed(2)}σ
                  </span>
                ) : '—'
              }
              subtext={latestZCcrRcr != null ? getZScoreLabel(latestZCcrRcr) : undefined}
              trend={latestZCcrRcr > 1.0 ? 'down' : latestZCcrRcr < -1.0 ? 'up' : 'neutral'}
            />
            <ToolbarStat
              label="RCR-OCR Signal"
              value={
                latestZRcrOcr != null ? (
                  <span className={getZScoreColor(latestZRcrOcr)}>
                    {latestZRcrOcr >= 0 ? '+' : ''}{latestZRcrOcr.toFixed(2)}σ
                  </span>
                ) : '—'
              }
              subtext={latestZRcrOcr != null ? getZScoreLabel(latestZRcrOcr) : undefined}
              trend={latestZRcrOcr > 1.0 ? 'down' : latestZRcrOcr < -1.0 ? 'up' : 'neutral'}
            />
            <ToolbarStat
              label="Divergence"
              value={divergence != null ? `${divergence >= 0 ? '+' : ''}${divergence.toFixed(1)}σ` : '—'}
              subtext={divergence != null ? (divergence > 0.5 ? 'CCR stretched' : divergence < -0.5 ? 'RCR stretched' : 'Aligned') : undefined}
              trend={divergence != null ? (divergence > 0.5 ? 'down' : divergence < -0.5 ? 'up' : 'neutral') : 'neutral'}
            />
          </DataCardToolbar>

          {/* Canvas: flex-grow */}
          <DataCardCanvas minHeight={height} cinema={cinema}>
            <PreviewChartOverlay chartRef={chartRef}>
              <Line ref={chartRef} data={chartData} options={chartOptions} />
            </PreviewChartOverlay>
          </DataCardCanvas>

          {/* StatusDeck: h-10 fixed - legend + periods */}
          <StatusDeck
            left={<span className="font-mono text-[9px] text-slate-400">{data.length} Periods ({TIME_LABELS[timeGrouping]})</span>}
          >
            <LegendLine label="CCR-RCR" color={CHART_COLORS.navy} />
            <LegendLine label="RCR-OCR" color={CHART_COLORS.ocean} lineStyle="dashed" />
          </StatusDeck>
        </DataCard>
      </ChartFrame>
    </div>
  );
}

export const MarketValueOscillator = React.memo(MarketValueOscillatorBase);

export default MarketValueOscillator;
