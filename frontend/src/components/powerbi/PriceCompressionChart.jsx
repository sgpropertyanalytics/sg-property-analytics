import React, { useRef, useMemo } from 'react';
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
import { KeyInsightBox, PreviewChartOverlay, ChartSlot, InlineCard, InlineCardRow } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import {
  transformCompressionSeries,
  calculateCompressionScore,
  calculateHistoricalBaseline,
  calculateAverageSpreads,
  detectMarketSignals,
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
 * }} props
 */
function PriceCompressionChartBase({ height = 380, saleType = null, sharedData = null, sharedStatus = 'idle' }) {
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters, timeGrouping } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  const districts = filters.districts?.join(',') || '';
  const { isPremium, isFreeResolved } = useSubscription();

  // UI state (not data state - that comes from useAbortableQuery)
  const chartRef = useRef(null);

  // Skip internal fetch if parent provides sharedData (eliminates duplicate API call)
  // Use loose equality to catch both null AND undefined (common when data hasn't arrived)
  const useSharedData = sharedData != null;

  // Defer fetch until chart is visible (low priority - below the fold)
  const { shouldFetch, containerRef } = useDeferredFetch({
    filterKey: `compression:${timeframe}:${bedroom}:${timeGrouping}`,
    priority: 'low',
    fetchOnMount: false,
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
    [], // Empty deps = fetch once on mount
    { chartName: 'PriceCompressionChart-baseline', initialData: null, enabled: shouldFetch, keepPreviousData: true }
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
        bedroom,
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
    // Explicit query key - TanStack handles cache deduplication
    ['price-compression', timeframe, bedroom, timeGrouping, saleType],
    { chartName: 'PriceCompressionChart', initialData: null, enabled: shouldFetch && !useSharedData, keepPreviousData: true }
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
  const marketSignals = useMemo(() => detectMarketSignals(data), [data]);
  const averageSpreads = useMemo(() => calculateAverageSpreads(data), [data]);
  const latestData = data[data.length - 1] || {};

  // Chart data for spread lines - simple, clean colors
  const spreadChartData = {
    labels: data.map(d => d.period),
    datasets: [
      {
        label: 'CCR-RCR Spread',
        data: data.map(d => d.ccrRcrSpread),
        borderColor: '#213448', // Navy
        backgroundColor: 'rgba(33, 52, 72, 0.1)',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#213448',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        fill: false,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'RCR-OCR Spread',
        data: data.map(d => d.rcrOcrSpread),
        borderColor: '#547792', // Ocean blue
        backgroundColor: 'rgba(84, 119, 146, 0.1)',
        borderWidth: 2.5,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#547792',
        pointHoverBorderColor: '#fff',
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
        grid: { color: 'rgba(148, 180, 193, 0.2)' },
      },
    },
  };

  // Card layout: flex column with fixed height
  const cardHeight = height + 200;

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
      height={350}
    >
      <div
        className="bg-card rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
      {/* Header - shrink-0 */}
      <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[#94B4C1]/30 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-[#213448] text-sm md:text-base">
              Market Compression Analysis
            </h3>
            <p className="text-xs text-[#547792] mt-0.5">
              Spread widening = fragmentation; spread narrowing = compression ({TIME_LABELS[timeGrouping]})
            </p>
          </div>
        </div>

        {/* KPI Row - Using standardized InlineCard components */}
        <InlineCardRow blur={isFreeResolved}>
          {/* Compression Score */}
          <InlineCard
            label="Compression Score"
            value={compressionScore.score}
            subtext={compressionScore.label}
          />

          {/* Smart Market Signal Cards */}
          <MarketSignalCard
            type="ccr-rcr"
            spread={latestData.ccrRcrSpread}
            avgSpread={averageSpreads.ccrRcr}
            isInverted={marketSignals.ccrDiscount}
          />
          <MarketSignalCard
            type="rcr-ocr"
            spread={latestData.rcrOcrSpread}
            avgSpread={averageSpreads.rcrOcr}
            isInverted={marketSignals.ocrOverheated}
          />
        </InlineCardRow>
      </div>

      {/* How to Interpret - shrink-0 */}
      <div className="shrink-0">
        <KeyInsightBox title="Reading this Chart" variant="info" compact>
          <p>
            <strong>Spreads narrowing</strong> = suburban catching up (compression). <strong>Spreads widening</strong> = prime outperforming (fragmentation). Watch for lines dipping below $0 — that's a price inversion anomaly.
          </p>
        </KeyInsightBox>
      </div>

      {/* Main Spread Chart - Chart.js handles data updates efficiently without key remount */}
      {/* ChartFrame handles empty state, so we always render the chart here */}
      <ChartSlot>
        <PreviewChartOverlay chartRef={chartRef}>
          <Line ref={chartRef} data={spreadChartData} options={spreadChartOptions} />
        </PreviewChartOverlay>
      </ChartSlot>

      {/* Custom SVG Legend */}
      <div className="flex justify-center gap-6 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <svg width="32" height="8">
            <line x1="0" y1="4" x2="32" y2="4" stroke="#213448" strokeWidth={2} />
          </svg>
          <span className="text-xs text-[#374151]">CCR-RCR Spread</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="32" height="8">
            <line x1="0" y1="4" x2="32" y2="4" stroke="#547792" strokeWidth={2} strokeDasharray="8 4" />
          </svg>
          <span className="text-xs text-[#374151]">RCR-OCR Spread</span>
        </div>
      </div>

      {/* Footer - fixed height h-11 for consistent alignment */}
      <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-end gap-3 text-xs text-[#547792]">
        <span className="truncate">{data.length} periods</span>
      </div>
      </div>
    </ChartFrame>
    </div>
  );
}

export const PriceCompressionChart = React.memo(PriceCompressionChartBase);

// ============================================
// SUB-COMPONENTS
// ============================================

/**
 * Smart Market Signal Card - Uses InlineCard with variant support
 * Shows + sign, value, and % vs average
 */
function MarketSignalCard({ type, spread, avgSpread, isInverted }) {
  if (spread == null) return null;

  // Calculate % difference from average
  const pctVsAvg = avgSpread && avgSpread !== 0
    ? Math.round(((spread - avgSpread) / Math.abs(avgSpread)) * 100)
    : null;

  const labels = {
    'ccr-rcr': 'CCR > RCR Premium',
    'rcr-ocr': 'RCR > OCR Premium',
  };

  // Inverted states (anomalies)
  if (isInverted) {
    if (type === 'ccr-rcr') {
      // CCR < RCR: Prime Discount (opportunity)
      return (
        <InlineCard
          label="Market Opportunity"
          value={`−$${Math.abs(spread).toLocaleString()} PSF`}
          subtext="Prime Discount"
          variant="success"
        />
      );
    }
    if (type === 'rcr-ocr') {
      // OCR > RCR: Risk Alert
      return (
        <InlineCard
          label="Risk Alert"
          value={`−$${Math.abs(spread).toLocaleString()} PSF`}
          subtext="OCR Overheated"
          variant="danger"
        />
      );
    }
  }

  // Normal state
  const isAboveAvg = pctVsAvg !== null && pctVsAvg > 0;
  const isBelowAvg = pctVsAvg !== null && pctVsAvg < 0;
  const subtextValue = pctVsAvg !== null
    ? (isBelowAvg ? `${pctVsAvg}% below avg` : isAboveAvg ? `+${pctVsAvg}% above avg` : 'At average')
    : undefined;

  return (
    <InlineCard
      label={labels[type]}
      value={`+$${spread.toLocaleString()} PSF`}
      subtext={subtextValue}
      trend={isBelowAvg ? 'up' : isAboveAvg ? 'down' : 'neutral'}
    />
  );
}

export default PriceCompressionChart;
