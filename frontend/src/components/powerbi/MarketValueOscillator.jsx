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
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import { getAggregate } from '../../api/client';
import { usePowerBIFilters, TIME_GROUP_BY } from '../../context/PowerBIFilterContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { KeyInsightBox, PreviewChartOverlay, ChartSlot, InlineCard, InlineCardRow } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  transformOscillatorSeries,
  calculateZScoreStats,
  getZScoreLabel,
  getZScoreColor,
  transformCompressionSeries,
  logFetchDebug,
  assertKnownVersion,
} from '../../adapters';
import { SaleType } from '../../schemas/apiContract';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin
);

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
 */
export function MarketValueOscillator({ height = 380, saleType = null }) {
  // Get GLOBAL filters and timeGrouping from context
  const { buildApiParams, debouncedFilterKey, timeGrouping } = usePowerBIFilters();
  const { isPremium } = useSubscription();

  const chartRef = useRef(null);

  // Defer fetch until chart is visible
  const { shouldFetch, containerRef } = useDeferredFetch({
    filterKey: `${debouncedFilterKey}:${timeGrouping}`,
    priority: 'low',
    fetchOnMount: true,
  });

  // HISTORICAL BASELINE: Fetch full historical data (no date filters)
  // This provides stable mean/stdDev for Z-score calculation
  // Uses page-level saleType prop for consistency with current data
  // Defaults to RESALE if not provided (new sales can be artificially priced)
  const { data: baselineStats } = useAbortableQuery(
    async (signal) => {
      // Use page prop or fallback to canonical RESALE enum
      // See CLAUDE.md "Business Logic Enforcement" - charts receive saleType from page
      const effectiveSaleType = saleType || SaleType.RESALE;
      const params = {
        group_by: 'quarter,region',
        metrics: 'median_psf,count',
        sale_type: effectiveSaleType,
      };

      const response = await getAggregate(params, { signal });
      const rawData = response.data?.data || [];
      const compressionData = transformCompressionSeries(rawData, 'quarter');
      return calculateZScoreStats(compressionData);
    },
    [saleType], // Refetch if saleType changes (rare - usually constant from page)
    {
      initialData: { ccrRcr: { mean: 400, stdDev: 200 }, rcrOcr: { mean: 200, stdDev: 100 } },
      enabled: shouldFetch
    }
  );

  // Main filtered data fetching - uses page-level saleType prop
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // saleType is passed from page level - see CLAUDE.md "Business Logic Enforcement"
      const params = buildApiParams({
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count',
        ...(saleType && { sale_type: saleType }),
      });

      const response = await getAggregate(params, { signal });

      // Validate API contract version
      assertKnownVersion(response.data, '/api/aggregate');

      const rawData = response.data?.data || [];

      logFetchDebug('MarketValueOscillator', {
        endpoint: '/api/aggregate',
        timeGrain: timeGrouping,
        response: response.data,
        rowCount: rawData.length,
      });

      // Transform to Z-scores using historical baseline
      return transformOscillatorSeries(rawData, timeGrouping, baselineStats);
    },
    [debouncedFilterKey, timeGrouping, baselineStats, saleType],
    { initialData: [], enabled: shouldFetch }
  );

  // Get latest values for KPI cards
  const latestData = data[data.length - 1] || {};
  const latestZCcrRcr = latestData.zCcrRcr;
  const latestZRcrOcr = latestData.zRcrOcr;

  // Calculate divergence between the two Z-scores
  const divergence = useMemo(() => {
    if (latestZCcrRcr === null || latestZRcrOcr === null) return null;
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
        label: 'RCR-OCR Z-Score',
        data: data.map(d => d.zRcrOcr),
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

  // Chart options with gradient zone annotations
  const chartOptions = {
    ...baseChartJsOptions,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 16,
          font: { size: 11 },
        },
      },
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
              const deviation = d.ccrRcrSpread - baselineStats.ccrRcr.mean;
              return [
                `CCR-RCR: ${z?.toFixed(2) || 'N/A'}σ (${signal})`,
                `Current: $${d.ccrRcrSpread?.toLocaleString() || 'N/A'} PSF`,
                `${deviation >= 0 ? '+' : ''}$${Math.round(deviation)} vs avg ($${Math.round(baselineStats.ccrRcr.mean)})`,
              ];
            }
            // RCR-OCR
            const deviation = d.rcrOcrSpread - baselineStats.rcrOcr.mean;
            return [
              `RCR-OCR: ${z?.toFixed(2) || 'N/A'}σ (${signal})`,
              `Current: $${d.rcrOcrSpread?.toLocaleString() || 'N/A'} PSF`,
              `${deviation >= 0 ? '+' : ''}$${Math.round(deviation)} vs avg ($${Math.round(baselineStats.rcrOcr.mean)})`,
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
            backgroundColor: 'rgba(239, 68, 68, 0.20)',
            borderWidth: 0,
          },
          // Elevated zone (light red) - +1σ to +2σ
          elevatedZone: {
            type: 'box',
            yMin: 1.0,
            yMax: 2.0,
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderWidth: 0,
          },
          // Normal zone (grey) - between -1σ and +1σ
          normalZone: {
            type: 'box',
            yMin: -1.0,
            yMax: 1.0,
            backgroundColor: 'rgba(148, 180, 193, 0.15)',
            borderWidth: 0,
          },
          // Compressed zone (light green) - -2σ to -1σ
          compressedZone: {
            type: 'box',
            yMin: -2.0,
            yMax: -1.0,
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            borderWidth: 0,
          },
          // Extreme undervalued zone (dark green) - beyond -2σ
          extremeUndervaluedZone: {
            type: 'box',
            yMin: yAxisBounds.min,
            yMax: -2.0,
            backgroundColor: 'rgba(16, 185, 129, 0.20)',
            borderWidth: 0,
          },
          // Zero line (historical average)
          zeroLine: {
            type: 'line',
            yMin: 0,
            yMax: 0,
            borderColor: 'rgba(0, 0, 0, 0.3)',
            borderWidth: 1,
            borderDash: [4, 4],
            label: {
              display: true,
              content: 'Avg',
              position: 'start',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              color: '#fff',
              font: { size: 9 },
              padding: 3,
            },
          },
          // Upper threshold (+2σ)
          upperThreshold: {
            type: 'line',
            yMin: 2.0,
            yMax: 2.0,
            borderColor: 'rgba(239, 68, 68, 0.4)',
            borderWidth: 1,
            borderDash: [2, 4],
            label: {
              display: true,
              content: '+2σ',
              position: 'end',
              backgroundColor: 'rgba(239, 68, 68, 0.7)',
              color: '#fff',
              font: { size: 8 },
              padding: 2,
            },
          },
          // Lower threshold (-2σ)
          lowerThreshold: {
            type: 'line',
            yMin: -2.0,
            yMax: -2.0,
            borderColor: 'rgba(16, 185, 129, 0.4)',
            borderWidth: 1,
            borderDash: [2, 4],
            label: {
              display: true,
              content: '-2σ',
              position: 'end',
              backgroundColor: 'rgba(16, 185, 129, 0.7)',
              color: '#fff',
              font: { size: 8 },
              padding: 2,
            },
          },
          // Normal range lines (±1σ)
          upperNormal: {
            type: 'line',
            yMin: 1.0,
            yMax: 1.0,
            borderColor: 'rgba(148, 180, 193, 0.4)',
            borderWidth: 1,
            borderDash: [4, 4],
            label: {
              display: true,
              content: '+1σ',
              position: 'end',
              backgroundColor: 'rgba(148, 180, 193, 0.7)',
              color: '#213448',
              font: { size: 8 },
              padding: 2,
            },
          },
          lowerNormal: {
            type: 'line',
            yMin: -1.0,
            yMax: -1.0,
            borderColor: 'rgba(148, 180, 193, 0.4)',
            borderWidth: 1,
            borderDash: [4, 4],
            label: {
              display: true,
              content: '-1σ',
              position: 'end',
              backgroundColor: 'rgba(148, 180, 193, 0.7)',
              color: '#213448',
              font: { size: 8 },
              padding: 2,
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
        beginAtZero: false,
        grace: '10%',
        title: { display: true, text: 'Z-Score (σ)', font: { size: 11 } },
        ticks: {
          callback: (v) => v === 0 ? '0' : `${v > 0 ? '+' : ''}${v}σ`,
          font: { size: 10 },
          stepSize: 0.5,
        },
        grid: { color: 'rgba(148, 180, 193, 0.2)' },
      },
    },
  };

  // Card height with header + insight box
  const cardHeight = height + 240;

  // CRITICAL: containerRef must be OUTSIDE QueryState
  return (
    <div ref={containerRef}>
      <QueryState loading={loading} error={error} onRetry={refetch} empty={!data || data.length === 0} skeleton="line" height={350}>
        <div
          className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
          style={{ height: cardHeight }}
        >
          {/* Header */}
          <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[#94B4C1]/30 shrink-0">
            <div className="min-w-0">
              <h3 className="font-semibold text-[#213448] text-sm md:text-base">
                Market Value Oscillator
              </h3>
              <p className="text-xs text-[#547792] mt-0.5">
                Z-Score normalized spread analysis ({TIME_LABELS[timeGrouping]})
              </p>
            </div>

            {/* KPI Row */}
            <InlineCardRow blur={!isPremium}>
              <ZScoreSignalCard
                label="CCR-RCR"
                zScore={latestZCcrRcr}
                spread={latestData.ccrRcrSpread}
                avgSpread={baselineStats.ccrRcr.mean}
              />
              <ZScoreSignalCard
                label="RCR-OCR"
                zScore={latestZRcrOcr}
                spread={latestData.rcrOcrSpread}
                avgSpread={baselineStats.rcrOcr.mean}
              />
              {divergence !== null && (
                <InlineCard
                  label="Divergence"
                  value={`${divergence >= 0 ? '+' : ''}${divergence.toFixed(1)}σ`}
                  subtext={divergence > 0.5 ? 'CCR stretched' : divergence < -0.5 ? 'RCR stretched' : 'Aligned'}
                />
              )}
            </InlineCardRow>
          </div>

          {/* Insight Box */}
          <div className="shrink-0">
            <KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
              <p className="mb-2">
                This chart shows the relative price premium between regions (CCR–RCR and RCR–OCR) using <strong>resale transactions only</strong>, expressed as a Z-score against historical spreads. A Z-score near 0 indicates fair value and normal market conditions.
              </p>
              <div className="mb-2">
                <div className="font-semibold text-[#213448] mb-1">Interpretation Guide</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <div><span className="font-semibold text-[#547792]">±0σ to ±1.0σ</span> — Normal range, fair value.</div>
                  <div><span className="font-semibold text-amber-600">+1.0σ to +2.0σ</span> — Elevated premium, watch closely.</div>
                  <div><span className="font-semibold text-red-600">&gt; +2.0σ</span> — Extreme disparity, significant overvaluation.</div>
                  <div><span className="font-semibold text-sky-600">–1.0σ to –2.0σ</span> — Compressed premium, improving value.</div>
                  <div><span className="font-semibold text-emerald-600">&lt; –2.0σ</span> — Extreme compression, potential opportunity.</div>
                </div>
              </div>
            </KeyInsightBox>
          </div>

          {/* Chart */}
          <ChartSlot>
            {data.length > 0 ? (
              <PreviewChartOverlay chartRef={chartRef}>
                <Line ref={chartRef} data={chartData} options={chartOptions} />
              </PreviewChartOverlay>
            ) : (
              <div className="flex items-center justify-center h-full text-[#547792]">
                <div className="text-center">
                  <p className="text-sm">No data available for selected filters</p>
                </div>
              </div>
            )}
          </ChartSlot>

          {/* Footer */}
          <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-end gap-3 text-xs text-[#547792]">
            <span className="truncate">{data.length} periods</span>
          </div>
        </div>
      </QueryState>
    </div>
  );
}

/**
 * Z-Score Signal Card - Shows Z-score value with color-coded label
 */
function ZScoreSignalCard({ label, zScore, spread, avgSpread }) {
  if (zScore === null || zScore === undefined) return null;

  const signalLabel = getZScoreLabel(zScore);
  const colorClass = getZScoreColor(zScore);

  // Determine variant based on Z-score
  let variant = 'default';
  if (zScore > 1.0) variant = 'danger';
  else if (zScore < -1.0) variant = 'success';

  const deviation = spread !== null ? spread - avgSpread : null;
  const deviationText = deviation !== null
    ? `${deviation >= 0 ? '+' : ''}$${Math.round(deviation)} vs avg`
    : undefined;

  return (
    <InlineCard
      label={`${label} Signal`}
      value={
        <span className={colorClass}>
          {zScore >= 0 ? '+' : ''}{zScore.toFixed(2)}σ
        </span>
      }
      subtext={signalLabel}
      variant={variant}
    />
  );
}

export default MarketValueOscillator;
