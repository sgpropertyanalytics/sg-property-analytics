import React, { useRef, useMemo } from 'react';
import { useAbortableQuery, useDeferredFetch } from '../../hooks';
import { QueryState } from '../common/QueryState';
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
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import { getAggregate } from '../../api/client';
import { usePowerBIFilters, TIME_GROUP_BY } from '../../context/PowerBIFilterContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { KeyInsightBox, PreviewChartOverlay, ChartSlot, InlineCard, InlineCardRow } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  transformCompressionSeries,
  calculateCompressionScore,
  calculateHistoricalBaseline,
  calculateAverageSpreads,
  detectMarketSignals,
  calculateSpreadPercentiles,
  logFetchDebug,
  assertKnownVersion,
} from '../../adapters';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  annotationPlugin
);

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
 */
export function PriceCompressionChart({ height = 380 }) {
  // Get GLOBAL filters and timeGrouping from context
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey, timeGrouping } = usePowerBIFilters();
  const { isPremium } = useSubscription();

  // UI state (not data state - that comes from useAbortableQuery)
  const chartRef = useRef(null);

  // Defer fetch until chart is visible (low priority - below the fold)
  // IMPORTANT: filterKey must include ALL state that affects the query data
  // timeGrouping changes the aggregation, so it's part of the query key
  const { shouldFetch, containerRef } = useDeferredFetch({
    filterKey: `${debouncedFilterKey}:${timeGrouping}`,
    priority: 'low',
    fetchOnMount: true,
  });

  // HISTORICAL BASELINE: Fetch full historical data once (no date filters)
  // This provides stable min/max for compression score calculation
  // Uses quarterly grain for efficiency - baseline doesn't need fine-grained time
  const { data: baselineData } = useAbortableQuery(
    async (signal) => {
      // No date filters, no highlights - full historical data
      const params = {
        group_by: 'quarter,region',
        metrics: 'median_psf,count',
      };

      const response = await getAggregate(params, { signal });
      const rawData = response.data?.data || [];
      const transformed = transformCompressionSeries(rawData, 'quarter');
      return calculateHistoricalBaseline(transformed);
    },
    [], // Empty deps = fetch once on mount
    { initialData: { min: 0, max: 1000 }, enabled: shouldFetch }
  );

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Use global timeGrouping via TIME_GROUP_BY mapping
      const params = buildApiParams({
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count'
      });

      const response = await getAggregate(params, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/aggregate');

      const rawData = response.data?.data || [];

      // Debug logging (dev only)
      logFetchDebug('PriceCompressionChart', {
        endpoint: '/api/aggregate',
        timeGrain: timeGrouping,
        response: response.data,
        rowCount: rawData.length,
      });

      // Use adapter for transformation - centralizes all data munging
      return transformCompressionSeries(rawData, timeGrouping);
    },
    [debouncedFilterKey, timeGrouping],
    { initialData: [], enabled: shouldFetch }
  );


  // Computed values - use historical baseline for stable min/max
  const compressionScore = useMemo(
    () => calculateCompressionScore(data, baselineData),
    [data, baselineData]
  );
  const marketSignals = useMemo(() => detectMarketSignals(data), [data]);
  const averageSpreads = useMemo(() => calculateAverageSpreads(data), [data]);
  const spreadPercentiles = useMemo(() => calculateSpreadPercentiles(data), [data]);
  const latestData = data[data.length - 1] || {};

  // Segment color functions based on percentiles
  // CCR-RCR: Green (<0 discount), Yellow (<p25 undervalued), Normal (p25-p75), Red (>p75 overvalued)
  const getCcrRcrSegmentColor = (ctx) => {
    const value = ctx.p1.parsed.y;
    if (value === null || value === undefined) return '#213448';
    if (value < 0) return '#10B981'; // Green - CCR discount
    if (value < spreadPercentiles.ccrRcr.p25) return '#F59E0B'; // Amber - CCR undervalued
    if (value > spreadPercentiles.ccrRcr.p75) return '#EF4444'; // Red - CCR overvalued
    return '#213448'; // Navy - normal
  };

  // RCR-OCR: Dark Red (<0 OCR overheated), Yellow (<p25 OCR catching up), Normal, Red (>p75 RCR overvalued)
  const getRcrOcrSegmentColor = (ctx) => {
    const value = ctx.p1.parsed.y;
    if (value === null || value === undefined) return '#547792';
    if (value < 0) return '#DC2626'; // Dark Red - OCR overheated
    if (value < spreadPercentiles.rcrOcr.p25) return '#F59E0B'; // Amber - OCR catching up
    if (value > spreadPercentiles.rcrOcr.p75) return '#EF4444'; // Red - RCR overvalued
    return '#547792'; // Ocean blue - normal
  };

  // Point colors follow same logic
  const ccrRcrPointColors = data.map(d => {
    const value = d.ccrRcrSpread;
    if (value === null) return '#213448';
    if (value < 0) return '#10B981';
    if (value < spreadPercentiles.ccrRcr.p25) return '#F59E0B';
    if (value > spreadPercentiles.ccrRcr.p75) return '#EF4444';
    return '#213448';
  });

  const rcrOcrPointColors = data.map(d => {
    const value = d.rcrOcrSpread;
    if (value === null) return '#547792';
    if (value < 0) return '#DC2626';
    if (value < spreadPercentiles.rcrOcr.p25) return '#F59E0B';
    if (value > spreadPercentiles.rcrOcr.p75) return '#EF4444';
    return '#547792';
  });

  // Chart data for spread lines
  const spreadChartData = {
    labels: data.map(d => d.period),
    datasets: [
      {
        label: 'CCR-RCR Spread',
        data: data.map(d => d.ccrRcrSpread),
        borderColor: '#213448',
        backgroundColor: 'rgba(33, 52, 72, 0.15)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: ccrRcrPointColors,
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        fill: false,
        tension: 0.3,
        spanGaps: true,
        segment: {
          borderColor: getCcrRcrSegmentColor,
        },
      },
      {
        label: 'RCR-OCR Spread',
        data: data.map(d => d.rcrOcrSpread),
        borderColor: '#547792',
        backgroundColor: 'rgba(84, 119, 146, 0.15)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 3,
        pointBackgroundColor: rcrOcrPointColors,
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        fill: false,
        tension: 0.3,
        spanGaps: true,
        segment: {
          borderColor: getRcrOcrSegmentColor,
        },
      },
    ],
  };

  // Chart options with annotations
  const spreadChartOptions = {
    ...baseChartJsOptions,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 12,
          font: { size: 10 },
          generateLabels: (_chart) => {
            return [
              {
                text: 'CCR-RCR Spread',
                fillStyle: '#213448',
                strokeStyle: '#213448',
                lineWidth: 2,
                pointStyle: 'line',
                hidden: false,
                datasetIndex: 0,
              },
              {
                text: 'RCR-OCR Spread',
                fillStyle: '#547792',
                strokeStyle: '#547792',
                lineWidth: 2,
                lineDash: [5, 5],
                pointStyle: 'line',
                hidden: false,
                datasetIndex: 1,
              },
              {
                text: '🟢 Undervalued',
                fillStyle: '#10B981',
                strokeStyle: '#10B981',
                pointStyle: 'rectRounded',
                hidden: false,
                datasetIndex: null,
              },
              {
                text: '🟡 Catching Up',
                fillStyle: '#F59E0B',
                strokeStyle: '#F59E0B',
                pointStyle: 'rectRounded',
                hidden: false,
                datasetIndex: null,
              },
              {
                text: '🔴 Overvalued',
                fillStyle: '#EF4444',
                strokeStyle: '#EF4444',
                pointStyle: 'rectRounded',
                hidden: false,
                datasetIndex: null,
              },
            ];
          },
        },
      },
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
      annotation: {
        annotations: {
          zeroLine: {
            type: 'line',
            yMin: 0,
            yMax: 0,
            borderColor: 'rgba(0, 0, 0, 0.3)',
            borderWidth: 1,
            borderDash: [4, 4],
            label: {
              display: true,
              content: '$0',
              position: 'start',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              color: '#fff',
              font: { size: 9 },
              padding: 3,
            },
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          font: { size: 10 },
        },
      },
      y: {
        title: { display: true, text: 'Spread ($/PSF)', font: { size: 11 } },
        ticks: {
          callback: (v) => `$${v.toLocaleString()}`,
          font: { size: 10 },
        },
        grid: { color: 'rgba(148, 180, 193, 0.2)' },
      },
    },
  };

  // Card layout: flex column with fixed height
  // Added 60px for KeyInsightBox
  const cardHeight = height + 260;

  // CRITICAL: containerRef must be OUTSIDE QueryState for IntersectionObserver to work
  // QueryState only renders children when not loading, so ref would be null during load
  return (
    <div ref={containerRef}>
    <QueryState loading={loading} error={error} onRetry={refetch} empty={!data || data.length === 0} skeleton="line" height={350}>
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
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
        <InlineCardRow blur={!isPremium}>
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
        <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
          <div className="space-y-1.5">
            <p><span className="font-semibold text-[#213448]">CCR-RCR Spread (solid line):</span> How much more CCR costs vs RCR.</p>
            <p><span className="font-semibold text-[#547792]">RCR-OCR Spread (dashed line):</span> How much more RCR costs vs OCR.</p>
            <div className="pt-1 border-t border-[#94B4C1]/30 mt-1">
              <p className="text-[10px] uppercase tracking-wide text-[#547792] mb-1">Line Color = Valuation Signal</p>
              <p>
                <span className="font-semibold text-emerald-600">Green</span> = undervalued (discount).{' '}
                <span className="font-semibold text-amber-600">Amber</span> = below average.{' '}
                <span className="font-semibold text-red-600">Red</span> = overvalued.{' '}
                Below $0 line = price inversion (anomaly).
              </p>
            </div>
          </div>
        </KeyInsightBox>
      </div>

      {/* Main Spread Chart - Chart.js handles data updates efficiently without key remount */}
      <ChartSlot>
        {data.length > 0 ? (
          <PreviewChartOverlay chartRef={chartRef}>
            <Line ref={chartRef} data={spreadChartData} options={spreadChartOptions} />
          </PreviewChartOverlay>
        ) : (
          <div className="flex items-center justify-center h-full text-[#547792]">
            <div className="text-center">
              <p className="text-sm">No data available for selected filters</p>
            </div>
          </div>
        )}
      </ChartSlot>

      {/* Footer - fixed height h-11 for consistent alignment */}
      <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-end gap-3 text-xs text-[#547792]">
        <span className="truncate">{data.length} periods</span>
      </div>
      </div>
    </QueryState>
    </div>
  );
}

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
