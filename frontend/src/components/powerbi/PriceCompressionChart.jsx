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
  Filler,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import { getAggregate } from '../../api/client';
import { usePowerBIFilters, TIME_GROUP_BY } from '../../context/PowerBIFilterContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  transformCompressionSeries,
  calculateCompressionScore,
  calculateAverageSpreads,
  detectMarketSignals,
  detectInversionZones,
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
 * Uses excludeHighlight: true (time-series chart pattern).
 */
export function PriceCompressionChart({ height = 380 }) {
  // Get GLOBAL filters and timeGrouping from context
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey, highlight, applyHighlight, timeGrouping } = usePowerBIFilters();
  const { isPremium } = useSubscription();

  // UI state (not data state - that comes from useAbortableQuery)
  const [showContext, setShowContext] = useState(false);
  const chartRef = useRef(null);

  // Defer fetch until chart is visible (low priority - below the fold)
  const { shouldFetch, containerRef } = useDeferredFetch({
    filterKey: debouncedFilterKey,
    priority: 'low',
    fetchOnMount: true,
  });

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Use global timeGrouping via TIME_GROUP_BY mapping, excludeHighlight for time-series pattern
      const params = buildApiParams({
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count'
      }, { excludeHighlight: true });

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

  // Click handler for highlight
  const handleChartClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const period = data[index]?.period;
      if (period) {
        applyHighlight('time', timeGrouping, period);
      }
    }
  };

  // Computed values
  const compressionScore = useMemo(() => calculateCompressionScore(data), [data]);
  const marketSignals = useMemo(() => detectMarketSignals(data), [data]);
  const inversionZones = useMemo(() => detectInversionZones(data), [data]);
  const averageSpreads = useMemo(() => calculateAverageSpreads(data), [data]);
  const latestData = data[data.length - 1] || {};
  const sparklineData = data.map(d => d.combinedSpread).filter(v => v != null);

  // Highlighted index for visual emphasis
  const highlightedIndex = useMemo(() => {
    if (highlight.source === 'time' && highlight.value) {
      return data.findIndex(d => String(d.period) === String(highlight.value));
    }
    return -1;
  }, [highlight, data]);

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
        pointRadius: data.map((_, i) => highlightedIndex === i ? 6 : 3),
        pointBackgroundColor: data.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? '#213448'
            : 'rgba(33, 52, 72, 0.4)'
        ),
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        fill: true,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'RCR-OCR Spread',
        data: data.map(d => d.rcrOcrSpread),
        borderColor: '#547792',
        backgroundColor: 'rgba(84, 119, 146, 0.15)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: data.map((_, i) => highlightedIndex === i ? 6 : 3),
        pointBackgroundColor: data.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? '#547792'
            : 'rgba(84, 119, 146, 0.4)'
        ),
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        fill: true,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  };

  // Chart options with annotations
  const spreadChartOptions = {
    ...baseChartJsOptions,
    interaction: { mode: 'index', intersect: false },
    onClick: handleChartClick,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: { size: 11 },
          generateLabels: (_chart) => {
            return [
              {
                text: 'CCR ↔ RCR Spread (solid)',
                fillStyle: '#213448',
                strokeStyle: '#213448',
                lineWidth: 2,
                pointStyle: 'line',
                hidden: false,
                datasetIndex: 0,
              },
              {
                text: 'RCR ↔ OCR Spread (dashed)',
                fillStyle: '#547792',
                strokeStyle: '#547792',
                lineWidth: 2,
                lineDash: [5, 5],
                pointStyle: 'line',
                hidden: false,
                datasetIndex: 1,
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
        annotations: buildInversionZones(inversionZones, data),
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

  // Context chart data (absolute PSF values)
  const contextChartData = {
    labels: data.map(d => d.period),
    datasets: [
      {
        label: 'CCR (Core Central)',
        data: data.map(d => d.ccr),
        borderColor: '#213448',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'RCR (Rest of Central)',
        data: data.map(d => d.rcr),
        borderColor: '#547792',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'OCR (Outside Central)',
        data: data.map(d => d.ocr),
        borderColor: '#94B4C1',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  };

  const contextChartOptions = {
    ...baseChartJsOptions,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, padding: 10, font: { size: 10 } },
      },
      tooltip: { enabled: false },
    },
    scales: {
      x: { display: false },
      y: {
        ticks: { callback: (v) => `$${v.toLocaleString()}`, font: { size: 9 } },
        grid: { color: 'rgba(148, 180, 193, 0.1)' },
      },
    },
  };

  // Card layout: flex column with fixed height
  // When showContext is true, we need extra space for the context chart
  const cardHeight = height + 200 + (showContext ? height * 0.25 : 0);

  return (
    <QueryState loading={loading} error={error} onRetry={refetch} empty={!data || data.length === 0} skeleton="line" height={350}>
      <div
        ref={containerRef}
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

        {/* KPI Row: Compression Score + Market Signals */}
        {/* All 3 cards same height (h-[72px]) and blurred for free users */}
        <div className={`flex flex-wrap items-stretch gap-3 mt-3 ${!isPremium ? 'blur-sm grayscale-[40%]' : ''}`}>
          {/* Compression Score Box */}
          <div className="bg-[#213448]/5 rounded-lg px-3 py-2 text-center min-w-[90px] h-[72px] flex flex-col justify-center">
            <div className="text-xl md:text-2xl font-bold text-[#213448]">{compressionScore.score}</div>
            <div className="text-[10px] md:text-xs text-[#547792]">Compression ({compressionScore.label})</div>
            <Sparkline data={sparklineData} width={70} height={16} />
          </div>

          {/* Smart Market Signal Cards */}
          <div className="flex flex-wrap items-stretch gap-2">
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
          </div>
        </div>
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

      {/* Context Panel (Collapsible) - shrink-0 with fixed height */}
      {showContext && data.length > 0 && (
        <div className="px-3 pb-3 md:px-4 md:pb-4 shrink-0" style={{ height: height * 0.25 }}>
          <div className="text-xs text-[#547792] mb-1 font-medium">Absolute PSF Context</div>
          <div className="h-[calc(100%-20px)] w-full relative">
            <Line data={contextChartData} options={contextChartOptions} />
          </div>
        </div>
      )}

      {/* Footer - fixed height h-11 for consistent alignment */}
      <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
        <button
          onClick={() => setShowContext(!showContext)}
          className="shrink-0 hover:text-[#213448] transition-colors"
        >
          {showContext ? '▲ Hide' : '▼ Show'} absolute PSF
        </button>
        <span className="truncate">{data.length} periods | Click to highlight</span>
      </div>
      </div>
    </QueryState>
  );
}

// ============================================
// UI HELPER FUNCTIONS (Chart-specific, not data transforms)
// ============================================

/**
 * Build Chart.js annotation boxes for inversion zones
 */
function buildInversionZones(zones, _data) {
  const result = {};

  // CCR Discount zones (green/amber background)
  zones.ccrDiscountZones?.forEach((zone, idx) => {
    result[`ccr_discount_${idx}`] = {
      type: 'box',
      xMin: zone.start - 0.5,
      xMax: zone.end + 0.5,
      backgroundColor: 'rgba(251, 191, 36, 0.15)', // amber-400 with low opacity
      borderColor: 'rgba(251, 191, 36, 0.4)',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        content: 'Prime Discount',
        display: zone.end - zone.start >= 1, // Only show label if zone spans 2+ periods
        position: 'start',
        color: 'rgba(180, 83, 9, 0.8)',
        font: { size: 9, weight: 'bold' },
      },
    };
  });

  // OCR Overheated zones (red background)
  zones.ocrOverheatedZones?.forEach((zone, idx) => {
    result[`ocr_overheated_${idx}`] = {
      type: 'box',
      xMin: zone.start - 0.5,
      xMax: zone.end + 0.5,
      backgroundColor: 'rgba(239, 68, 68, 0.12)', // red-500 with low opacity
      borderColor: 'rgba(239, 68, 68, 0.3)',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        content: 'OCR Overheated',
        display: zone.end - zone.start >= 1,
        position: 'start',
        color: 'rgba(185, 28, 28, 0.8)',
        font: { size: 9, weight: 'bold' },
      },
    };
  });

  return result;
}

// ============================================
// SUB-COMPONENTS
// ============================================

/**
 * Mini sparkline for compression trend
 */
function Sparkline({ data, width = 70, height = 16 }) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="mx-auto mt-1">
      <polyline
        points={points}
        fill="none"
        stroke="#547792"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Smart Market Signal Card
 * Consistent height with compression score card
 * Shows + sign, value, and % vs average
 */
function MarketSignalCard({ type, spread, avgSpread, isInverted }) {
  if (spread == null) return null;

  // Calculate % difference from average
  const pctVsAvg = avgSpread && avgSpread !== 0
    ? Math.round(((spread - avgSpread) / Math.abs(avgSpread)) * 100)
    : null;

  const labels = {
    'ccr-rcr': 'Prime Premium (CCR vs RCR)',
    'rcr-ocr': 'Fringe Premium (RCR vs OCR)',
  };

  // Inverted states (anomalies)
  if (isInverted) {
    if (type === 'ccr-rcr') {
      // CCR < RCR: Prime Discount (opportunity)
      return (
        <div className="bg-amber-100 border-2 border-amber-400 rounded-lg px-3 py-2 text-center min-w-[140px] h-[72px] flex flex-col justify-center">
          <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
            Market Anomaly
          </div>
          <div className="text-lg md:text-xl font-bold text-amber-900">
            −${Math.abs(spread).toLocaleString()} PSF
          </div>
          <div className="text-[10px] text-amber-700 font-semibold">
            Prime Discount
          </div>
        </div>
      );
    }
    if (type === 'rcr-ocr') {
      // OCR > RCR: Risk Alert
      return (
        <div className="bg-red-50 border-2 border-red-500 rounded-lg px-3 py-2 text-center min-w-[140px] h-[72px] flex flex-col justify-center">
          <div className="text-[10px] font-bold text-red-800 uppercase tracking-wider">
            Risk Alert
          </div>
          <div className="text-lg md:text-xl font-bold text-red-900">
            −${Math.abs(spread).toLocaleString()} PSF
          </div>
          <div className="text-[10px] text-red-700 font-semibold">
            OCR Overheated
          </div>
        </div>
      );
    }
  }

  // Normal state - consistent card design
  const isAboveAvg = pctVsAvg !== null && pctVsAvg > 0;
  const isBelowAvg = pctVsAvg !== null && pctVsAvg < 0;

  return (
    <div className="bg-[#213448]/5 rounded-lg px-3 py-2 text-center min-w-[140px] h-[72px] flex flex-col justify-center">
      <div className="text-[10px] text-[#547792] uppercase tracking-wide">
        {labels[type]}
      </div>
      <div className="text-lg md:text-xl font-bold text-[#213448]">
        +${spread.toLocaleString()} PSF
      </div>
      {pctVsAvg !== null && (
        <div className={`text-[10px] font-medium ${
          isBelowAvg ? 'text-emerald-600' : isAboveAvg ? 'text-red-600' : 'text-[#547792]'
        }`}>
          {isBelowAvg ? `${pctVsAvg}% below avg` : isAboveAvg ? `+${pctVsAvg}% above avg` : 'At average'}
        </div>
      )}
    </div>
  );
}

export default PriceCompressionChart;
