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
import { Line } from 'react-chartjs-2';
import { getAggregate } from '../../api/client';
import { usePowerBIFilters, TIME_GROUP_BY } from '../../context/PowerBIFilterContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  transformCompressionSeries,
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
  Legend
);

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
 * Uses excludeHighlight: true (time-series chart pattern).
 */
export function AbsolutePsfChart({ height = 300 }) {
  const { buildApiParams, debouncedFilterKey, highlight, applyHighlight, timeGrouping } = usePowerBIFilters();
  const { isPremium } = useSubscription();
  const chartRef = useRef(null);

  // Defer fetch until chart is visible (low priority - below the fold)
  // IMPORTANT: filterKey must include ALL state that affects the query data
  // timeGrouping changes the aggregation, so it's part of the query key
  const { shouldFetch, containerRef } = useDeferredFetch({
    filterKey: `${debouncedFilterKey}:${timeGrouping}`,
    priority: 'low',
    fetchOnMount: true,
  });

  // Data fetching - same as PriceCompressionChart for consistency
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count'
      }, { excludeHighlight: true });

      const response = await getAggregate(params, { signal });
      assertKnownVersion(response.data, '/api/aggregate');

      const rawData = response.data?.data || [];
      logFetchDebug('AbsolutePsfChart', {
        endpoint: '/api/aggregate',
        timeGrain: timeGrouping,
        response: response.data,
        rowCount: rawData.length,
      });

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

  // Highlighted index for visual emphasis
  const highlightedIndex = useMemo(() => {
    if (highlight.source === 'time' && highlight.value) {
      return data.findIndex(d => String(d.period) === String(highlight.value));
    }
    return -1;
  }, [highlight, data]);

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
        backgroundColor: 'rgba(33, 52, 72, 0.1)',
        borderWidth: 2,
        pointRadius: data.map((_, i) => highlightedIndex === i ? 6 : 3),
        pointBackgroundColor: data.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? REGION_COLORS.CCR
            : 'rgba(33, 52, 72, 0.4)'
        ),
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      },
      {
        label: 'RCR (Rest of Central)',
        data: data.map(d => d.rcr),
        borderColor: REGION_COLORS.RCR,
        backgroundColor: 'rgba(84, 119, 146, 0.1)',
        borderWidth: 2,
        pointRadius: data.map((_, i) => highlightedIndex === i ? 6 : 3),
        pointBackgroundColor: data.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? REGION_COLORS.RCR
            : 'rgba(84, 119, 146, 0.4)'
        ),
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      },
      {
        label: 'OCR (Outside Central)',
        data: data.map(d => d.ocr),
        borderColor: REGION_COLORS.OCR,
        backgroundColor: 'rgba(148, 180, 193, 0.1)',
        borderWidth: 2,
        pointRadius: data.map((_, i) => highlightedIndex === i ? 6 : 3),
        pointBackgroundColor: data.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? REGION_COLORS.OCR
            : 'rgba(148, 180, 193, 0.4)'
        ),
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
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
    onClick: handleChartClick,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: { size: 11 },
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
          maxRotation: 45,
          minRotation: 45,
          font: { size: 10 },
        },
      },
      y: {
        title: { display: true, text: 'Median PSF ($)', font: { size: 11 } },
        ticks: {
          callback: (v) => `$${v.toLocaleString()}`,
          font: { size: 10 },
        },
        grid: { color: 'rgba(148, 180, 193, 0.2)' },
      },
    },
  };

  // CRITICAL: containerRef must be OUTSIDE QueryState for IntersectionObserver to work
  // QueryState only renders children when not loading, so ref would be null during load
  return (
    <div ref={containerRef}>
    <QueryState loading={loading} error={error} onRetry={refetch} empty={!data || data.length === 0} skeleton="line" height={height}>
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col h-full"
      >
        {/* Header */}
        <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[#94B4C1]/30 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-[#213448] text-sm md:text-base">
                Absolute PSF by Region
              </h3>
              <p className="text-xs text-[#547792] mt-0.5">
                Median price per square foot trend ({TIME_LABELS[timeGrouping]})
              </p>
            </div>
          </div>

          {/* KPI Row - Grid with equal columns for consistent sizing */}
          <div className={`grid grid-cols-3 gap-2 mt-3 ${!isPremium ? 'blur-sm grayscale-[40%]' : ''}`}>
            <PsfKpiCard
              label="CCR"
              value={latestData.ccr}
              change={ccrChange}
              color={REGION_COLORS.CCR}
            />
            <PsfKpiCard
              label="RCR"
              value={latestData.rcr}
              change={rcrChange}
              color={REGION_COLORS.RCR}
            />
            <PsfKpiCard
              label="OCR"
              value={latestData.ocr}
              change={ocrChange}
              color={REGION_COLORS.OCR}
            />
          </div>
        </div>

        {/* Chart Area */}
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
        <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
          <span className="truncate">{data.length} periods | Click to highlight</span>
          <span className="text-[10px]">
            {latestData.counts
              ? `${(latestData.counts.CCR || 0) + (latestData.counts.RCR || 0) + (latestData.counts.OCR || 0)} total txns`
              : ''}
          </span>
        </div>
      </div>
    </QueryState>
    </div>
  );
}

/**
 * PSF KPI Card - Shows current value and period-over-period change
 */
function PsfKpiCard({ label, value, change, color }) {
  if (value == null) return null;

  return (
    <div
      className="rounded-lg px-3 py-2 text-center"
      style={{ backgroundColor: `${color}10` }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color }}>
        {label}
      </div>
      <div className="text-base md:text-lg font-bold font-mono tabular-nums text-[#213448]">
        ${Math.round(value).toLocaleString()}
      </div>
      {change !== null && (
        <div className={`text-[10px] font-medium ${
          change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-600' : 'text-[#547792]'
        }`}>
          {change > 0 ? '+' : ''}{change}% vs prev
        </div>
      )}
    </div>
  );
}

export default AbsolutePsfChart;
