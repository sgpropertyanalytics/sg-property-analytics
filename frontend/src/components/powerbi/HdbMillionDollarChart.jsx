import React, { useRef, useMemo } from 'react';
import { useAppQuery } from '../../hooks';
import { ChartFrame } from '../common/ChartFrame';
import { Chart } from 'react-chartjs-2';
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
} from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS, CHART_TOOLTIP } from '../../constants/chartOptions';
import { CHART_COLORS } from '../../constants/colors';
import { getHdbMillionDollarTrend } from '../../api/client';
import { niceMax } from '../../utils/niceAxisMax';
import { useZustandFilters } from '../../stores';
import { monthToQuarter, monthToYear } from '../../adapters/aggregate/timeAggregation';

/**
 * HDB Million-Dollar Chart — Bar + Line Combo
 *
 * X-axis: Period (Month/Quarter/Year — controlled by time grouping filter)
 * Y1 (bars, left):  Count of $1M+ HDB resale transactions
 * Y2 (line, right): Total quantum ($) of those transactions
 *
 * Data source: data.gov.sg HDB Resale Flat Prices dataset.
 * Responds to time grouping filter (month/quarter/year) like other charts.
 */

// Time level labels for display (matches TimeTrendChart pattern)
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

/**
 * Aggregate HDB monthly data by time grain.
 * HDB data shape: { month, count, total_quantum }
 */
function aggregateHdbByGrain(monthlyData, targetGrain) {
  if (!monthlyData?.length) return [];
  if (targetGrain === 'month') return monthlyData;

  const convertPeriod = targetGrain === 'quarter' ? monthToQuarter : monthToYear;
  const grouped = {};

  for (const row of monthlyData) {
    const targetPeriod = convertPeriod(row.month);
    if (!grouped[targetPeriod]) {
      grouped[targetPeriod] = { month: targetPeriod, count: 0, total_quantum: 0 };
    }
    grouped[targetPeriod].count += row.count ?? 0;
    grouped[targetPeriod].total_quantum += row.total_quantum ?? 0;
  }

  return Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * @param {{
 *  height?: number,
 *  staggerIndex?: number,
 *  variant?: 'standalone' | 'dashboard',
 * }} props
 */
function HdbMillionDollarChartBase({ height = 380, staggerIndex = 0, variant = 'standalone' }) {
  const isDashboard = variant === 'dashboard';
  const embedded = isDashboard;
  const cinema = isDashboard;

  // Read time grouping from Zustand store (same pattern as TimeTrendChart)
  const { timeGrouping } = useZustandFilters();

  const chartRef = useRef(null);

  const { data: queryResult, status, error, refetch } = useAppQuery(
    async (signal) => {
      const response = await getHdbMillionDollarTrend({ signal });
      // 202 = background fetch in progress; return loading sentinel
      // response.meta comes from unwrapEnvelope (axios interceptor strips the outer envelope)
      if (response.status === 202 || response.meta?.loading) {
        return { records: [], loading: true };
      }
      // response.data is the records array after unwrapEnvelope (not response.data.data)
      return { records: Array.isArray(response.data) ? response.data : [], loading: false };
    },
    ['hdb-million-dollar-trend'],
    {
      chartName: 'HdbMillionDollarChart',
      keepPreviousData: true,
      // Poll every 15s while background fetch is running
      refetchInterval: (data) => (data?.loading ? 15_000 : false),
    },
  );

  const isBackgroundLoading = queryResult?.loading === true;
  const rawData = isBackgroundLoading ? [] : (queryResult?.records ?? []);

  // Client-side aggregation by time grain (same pattern as useTimeSeriesQuery)
  const safeData = useMemo(
    () => aggregateHdbByGrain(rawData, timeGrouping),
    [rawData, timeGrouping],
  );

  const labels = safeData.map(d => d.month);
  const counts = safeData.map(d => d.count ?? 0);
  const quanta = safeData.map(d => d.total_quantum ?? 0);

  const maxCount = Math.max(...counts, 1);
  const yAxisMax = niceMax(Math.ceil(maxCount * 1.4));

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Transactions',
        data: counts,
        backgroundColor: CHART_COLORS.oceanAlpha(0.6),
        borderColor: CHART_COLORS.ocean,
        borderWidth: 1,
        borderRadius: 0,
        barPercentage: 0.85,
        categoryPercentage: 0.9,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Quantum',
        data: quanta,
        borderColor: CHART_COLORS.navy,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: CHART_COLORS.white,
        pointHoverBorderColor: CHART_COLORS.navy,
        pointHoverBorderWidth: 2,
        cubicInterpolationMode: 'monotone',
        tension: 0.4,
        fill: false,
        yAxisID: 'y1',
        order: 1,
      },
    ],
  };

  const options = useMemo(() => ({
    ...baseChartJsOptions,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...CHART_TOOLTIP,
        displayColors: true,
        boxPadding: 4,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label === 'Quantum') {
              if (value >= 1_000_000_000) {
                return ` ${label}: $${(value / 1_000_000_000).toFixed(2)}B`;
              }
              return ` ${label}: $${(value / 1_000_000).toFixed(0)}M`;
            }
            return ` ${label}: ${value.toLocaleString()} txns`;
          },
        },
      },
      crosshair: {
        line: {
          color: CHART_COLORS.slate400,
          width: 1,
          dashPattern: [4, 4],
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
          maxTicksLimit: 24,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        min: 0,
        max: yAxisMax,
        title: {
          display: true,
          text: 'Transactions',
          ...CHART_AXIS_DEFAULTS.title,
        },
        grid: { color: CHART_COLORS.skyAlpha20 },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => Math.round(value).toLocaleString(),
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0,
        title: {
          display: true,
          text: 'Quantum ($)',
          ...CHART_AXIS_DEFAULTS.title,
        },
        grid: { drawOnChartArea: false },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => {
            if (value >= 1_000_000_000) {
              return `$${(value / 1_000_000_000).toFixed(1)}B`;
            }
            return `$${(value / 1_000_000).toFixed(0)}M`;
          },
        },
      },
    },
  }), [yAxisMax]);

  const totalTransactions = counts.reduce((sum, c) => sum + c, 0);
  const totalQuantum = quanta.reduce((sum, v) => sum + v, 0);
  const peakPeriod = safeData.length > 0
    ? safeData.reduce((best, d) => (d.count > best.count ? d : best), safeData[0])
    : null;

  return (
    <ChartFrame
      status={isBackgroundLoading ? 'pending' : status}
      isFiltering={false}
      error={error}
      onRetry={refetch}
      empty={!isBackgroundLoading && safeData.length === 0}
      skeleton="bar"
      height={height}
      staggerIndex={staggerIndex}
    >
      <DataCard variant={embedded ? 'embedded' : 'standalone'}>
        {/* Layer 1: Header */}
        <DataCardHeader
          title="HDB Resale · $1M+ Transactions"
          logic="Count of HDB resale transactions ≥ $1M per period. Quantum = total value."
          info={`Transactions — HDB resale transaction count at or above $1,000,000.
Quantum — Total transaction value for those transactions.
Grouped by ${TIME_LABELS[timeGrouping]}.
Source: data.gov.sg HDB Resale Flat Prices (Jan 2017–present).`}
        />

        {/* Layer 2: KPI Strip */}
        <DataCardToolbar columns={3} blur={false}>
          <ToolbarStat
            label="Total Volume"
            value={totalTransactions.toLocaleString()}
            subtext="$1M+ transactions"
          />
          <ToolbarStat
            label="Total Quantum"
            value={totalQuantum >= 1e9 ? `$${(totalQuantum / 1e9).toFixed(1)}B` : `$${(totalQuantum / 1e6).toFixed(0)}M`}
            subtext="aggregate value"
          />
          <ToolbarStat
            label="Peak Period"
            value={peakPeriod ? peakPeriod.month : '—'}
            subtext={peakPeriod ? `${peakPeriod.count} txns` : 'no data'}
          />
        </DataCardToolbar>

        {/* Layer 3: Canvas */}
        <DataCardCanvas minHeight={height} cinema={cinema}>
          <PreviewChartOverlay chartRef={chartRef}>
            <Chart ref={chartRef} type="bar" data={chartData} options={options} />
          </PreviewChartOverlay>
        </DataCardCanvas>

        {/* Layer 4: Status footer */}
        <StatusDeck
          left={<StatusPeriod>{safeData.length} Periods ({TIME_LABELS[timeGrouping]})</StatusPeriod>}
          right={<StatusCount count={totalTransactions} />}
        >
          <LegendLine label="Transactions" color={CHART_COLORS.ocean} />
          <LegendLine label="Quantum" color={CHART_COLORS.navy} />
        </StatusDeck>
      </DataCard>
    </ChartFrame>
  );
}

export const HdbMillionDollarChart = React.memo(HdbMillionDollarChartBase);

export default HdbMillionDollarChart;
