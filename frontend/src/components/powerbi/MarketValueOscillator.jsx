import React, { useRef, useMemo, useState } from 'react';
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
  calculateRollingAverage,
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
  annotationPlugin
);

// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

// Rolling average window options
const ROLLING_AVG_OPTIONS = [
  { value: 6, label: '6M' },
  { value: 12, label: '12M' },
  { value: 24, label: '24M' },
];

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
export function MarketValueOscillator({ height = 380 }) {
  // Get GLOBAL filters and timeGrouping from context
  const { buildApiParams, debouncedFilterKey, timeGrouping } = usePowerBIFilters();
  const { isPremium } = useSubscription();

  const chartRef = useRef(null);
  const [rollingWindow, setRollingWindow] = useState(12);
  const [showMA, setShowMA] = useState(true);

  // Defer fetch until chart is visible
  const { shouldFetch, containerRef } = useDeferredFetch({
    filterKey: `${debouncedFilterKey}:${timeGrouping}`,
    priority: 'low',
    fetchOnMount: true,
  });

  // HISTORICAL BASELINE: Fetch full historical data once (no date filters)
  // This provides stable mean/stdDev for Z-score calculation
  const { data: baselineStats } = useAbortableQuery(
    async (signal) => {
      const params = {
        group_by: 'quarter,region',
        metrics: 'median_psf,count',
      };

      const response = await getAggregate(params, { signal });
      const rawData = response.data?.data || [];
      const compressionData = transformCompressionSeries(rawData, 'quarter');
      return calculateZScoreStats(compressionData);
    },
    [], // Empty deps = fetch once on mount
    {
      initialData: { ccrRcr: { mean: 400, stdDev: 200 }, rcrOcr: { mean: 200, stdDev: 100 } },
      enabled: shouldFetch
    }
  );

  // Main filtered data fetching
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count'
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
    [debouncedFilterKey, timeGrouping, baselineStats],
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

  // Calculate rolling averages with configurable window
  const rollingWindowLabel = ROLLING_AVG_OPTIONS.find(o => o.value === rollingWindow)?.label || `${rollingWindow}M`;
  const rollingAverages = useMemo(() => {
    const ccrRcrValues = data.map(d => d.zCcrRcr);
    const rcrOcrValues = data.map(d => d.zRcrOcr);
    return {
      ccrRcr: calculateRollingAverage(ccrRcrValues, rollingWindow),
      rcrOcr: calculateRollingAverage(rcrOcrValues, rollingWindow),
    };
  }, [data, rollingWindow]);

  // Chart data - conditionally include MA lines
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
      ...(showMA ? [
        {
          label: `CCR-RCR ${rollingWindowLabel} Avg`,
          data: rollingAverages.ccrRcr,
          borderColor: 'rgba(33, 52, 72, 0.5)', // Navy, lighter
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0.4,
          spanGaps: true,
        },
        {
          label: `RCR-OCR ${rollingWindowLabel} Avg`,
          data: rollingAverages.rcrOcr,
          borderColor: 'rgba(84, 119, 146, 0.5)', // Ocean blue, lighter
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0.4,
          spanGaps: true,
        },
      ] : []),
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

            // Rolling average datasets (indices 2, 3)
            if (context.datasetIndex === 2) {
              return z !== null ? `CCR-RCR ${rollingWindowLabel} Avg: ${z.toFixed(2)}σ` : '';
            }
            if (context.datasetIndex === 3) {
              return z !== null ? `RCR-OCR ${rollingWindowLabel} Avg: ${z.toFixed(2)}σ` : '';
            }

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
          // Premium zone (overvalued)
          premiumZone: {
            type: 'box',
            yMin: 1.0,
            yMax: 3,
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderWidth: 0,
          },
          // Value zone (undervalued)
          valueZone: {
            type: 'box',
            yMin: -3,
            yMax: -1.0,
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
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
          // Upper threshold (+1σ)
          upperThreshold: {
            type: 'line',
            yMin: 1.0,
            yMax: 1.0,
            borderColor: 'rgba(239, 68, 68, 0.3)',
            borderWidth: 1,
            borderDash: [2, 4],
            label: {
              display: true,
              content: '+1σ',
              position: 'end',
              backgroundColor: 'rgba(239, 68, 68, 0.6)',
              color: '#fff',
              font: { size: 8 },
              padding: 2,
            },
          },
          // Lower threshold (-1σ)
          lowerThreshold: {
            type: 'line',
            yMin: -1.0,
            yMax: -1.0,
            borderColor: 'rgba(16, 185, 129, 0.3)',
            borderWidth: 1,
            borderDash: [2, 4],
            label: {
              display: true,
              content: '-1σ',
              position: 'end',
              backgroundColor: 'rgba(16, 185, 129, 0.6)',
              color: '#fff',
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
        min: -3,
        max: 3,
        title: { display: true, text: 'σ (Standard Deviation)', font: { size: 11 } },
        ticks: {
          callback: (v) => `${v > 0 ? '+' : ''}${v}σ`,
          font: { size: 10 },
          stepSize: 1,
        },
        grid: { color: 'rgba(148, 180, 193, 0.2)' },
      },
    },
  };

  // Card height with header + expanded insight box
  const cardHeight = height + 280;

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
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-[#213448] text-sm md:text-base">
                  Market Value Oscillator
                </h3>
                <p className="text-xs text-[#547792] mt-0.5">
                  Z-Score normalized spread analysis ({TIME_LABELS[timeGrouping]})
                </p>
              </div>
              {/* Rolling Average Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowMA(!showMA)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    showMA
                      ? 'bg-[#213448] text-white border-[#213448]'
                      : 'bg-white text-[#547792] border-[#94B4C1]/50 hover:border-[#547792]'
                  }`}
                >
                  MA
                </button>
                {showMA && (
                  <select
                    value={rollingWindow}
                    onChange={(e) => setRollingWindow(Number(e.target.value))}
                    className="text-xs bg-white border border-[#94B4C1]/50 rounded px-1.5 py-0.5 text-[#213448] focus:outline-none focus:ring-1 focus:ring-[#547792]"
                  >
                    {ROLLING_AVG_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
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
                This chart shows the relative price premium between regions (CCR–RCR and RCR–OCR), expressed as a Z-score against historical spreads. A Z-score near 0 indicates fair value and normal market conditions.
              </p>
              <div className="mb-2">
                <div className="font-semibold text-[#213448] mb-1">Interpretation Guide</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <div><span className="font-semibold text-amber-600">+0.5σ to +1.0σ</span> — Above average but healthy range.</div>
                  <div><span className="font-semibold text-red-500">+1.0σ to +2.0σ</span> — Overvalued, risk of mean reversion.</div>
                  <div><span className="font-semibold text-red-700">&gt; +2.0σ</span> — Extremely overvalued, stretched beyond norms.</div>
                  <div><span className="font-semibold text-sky-600">–0.5σ to –1.0σ</span> — Below average, improving value.</div>
                  <div><span className="font-semibold text-emerald-600">&lt; –1.0σ</span> — Significantly undervalued, mean-reversion potential.</div>
                </div>
              </div>
              <div>
                <div className="font-semibold text-[#213448] mb-0.5">How to Read Movement</div>
                <p className="text-xs">
                  The direction of the line reflects market momentum, while the distance from zero indicates valuation risk. This metric is best used as a relative valuation gauge, not a short-term timing tool.
                </p>
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
