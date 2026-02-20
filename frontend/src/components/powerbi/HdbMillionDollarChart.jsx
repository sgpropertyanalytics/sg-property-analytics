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
import { CHART_COLORS, REGION, alpha } from '../../constants/colors';
import { getHdbMillionDollarTrend } from '../../api/client';
import { niceMax } from '../../utils/niceAxisMax';
import { useZustandFilters } from '../../stores';
import { monthToQuarter, monthToYear } from '../../adapters/aggregate/timeAggregation';

/**
 * HDB Million-Dollar Chart — Stacked Bar + Line Combo
 *
 * X-axis: Period (Month/Quarter/Year — controlled by time grouping filter)
 * Y1 (stacked bars, left):  Count of $1M+ transactions by region (CCR/RCR/OCR)
 * Y2 (line, right): Total quantum ($)
 *
 * Data source: data.gov.sg HDB Resale Flat Prices dataset.
 */

const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };
const REGIONS = ['CCR', 'RCR', 'OCR'];
const REGION_LABELS = { CCR: 'CCR (Core Central)', RCR: 'RCR (Rest of Central)', OCR: 'OCR (Outside Central)' };

/**
 * Pivot flat rows [{month, region, count, total_quantum}]
 * into per-period aggregated structure for chart rendering.
 *
 * Returns: { labels, ccr[], rcr[], ocr[], quantum[] }
 */
function pivotByRegion(rows, timeGrouping) {
  if (!rows?.length) return { labels: [], ccr: [], rcr: [], ocr: [], quantum: [] };

  const convertPeriod = timeGrouping === 'quarter' ? monthToQuarter
    : timeGrouping === 'year' ? monthToYear
      : (m) => m;

  // Accumulate by (period, region)
  const periods = {};
  for (const row of rows) {
    const period = convertPeriod(row.month);
    if (!periods[period]) {
      periods[period] = { CCR: 0, RCR: 0, OCR: 0, quantum: 0 };
    }
    const region = row.region || 'OCR';
    periods[period][region] = (periods[period][region] || 0) + (row.count ?? 0);
    periods[period].quantum += row.total_quantum ?? 0;
  }

  // Sort and flatten
  const sorted = Object.entries(periods).sort(([a], [b]) => a.localeCompare(b));
  return {
    labels: sorted.map(([p]) => p),
    ccr: sorted.map(([, v]) => v.CCR),
    rcr: sorted.map(([, v]) => v.RCR),
    ocr: sorted.map(([, v]) => v.OCR),
    quantum: sorted.map(([, v]) => v.quantum),
  };
}


function HdbMillionDollarChartBase({ height = 380, staggerIndex = 0, variant = 'standalone' }) {
  const isDashboard = variant === 'dashboard';
  const embedded = isDashboard;
  const cinema = isDashboard;

  const { timeGrouping } = useZustandFilters();
  const chartRef = useRef(null);

  const { data: queryResult, status, error, refetch } = useAppQuery(
    async (signal) => {
      const response = await getHdbMillionDollarTrend({ signal });
      if (response.status === 202 || response.meta?.loading) {
        return { records: [], loading: true };
      }
      return { records: Array.isArray(response.data) ? response.data : [], loading: false };
    },
    ['hdb-million-dollar-trend'],
    {
      chartName: 'HdbMillionDollarChart',
      keepPreviousData: true,
      refetchInterval: (data) => (data?.loading ? 15_000 : false),
    },
  );

  const isBackgroundLoading = queryResult?.loading === true;
  const rawData = isBackgroundLoading ? [] : (queryResult?.records ?? []);

  // Pivot raw rows into per-period stacked structure
  const { labels, ccr, rcr, ocr, quantum } = useMemo(
    () => pivotByRegion(rawData, timeGrouping),
    [rawData, timeGrouping],
  );

  // Total count per period (for y-axis scaling)
  const totalCounts = labels.map((_, i) => ccr[i] + rcr[i] + ocr[i]);
  const maxCount = Math.max(...totalCounts, 1);
  const yAxisMax = niceMax(Math.ceil(maxCount * 1.4));

  const chartData = {
    labels,
    datasets: [
      // Stacked bars — order: OCR bottom, RCR middle, CCR top
      {
        type: 'bar',
        label: 'OCR',
        data: ocr,
        backgroundColor: alpha(REGION.OCR, 0.7),
        borderColor: REGION.OCR,
        borderWidth: 1,
        borderRadius: 0,
        barPercentage: 0.85,
        categoryPercentage: 0.9,
        yAxisID: 'y',
        stack: 'region',
        order: 3,
      },
      {
        type: 'bar',
        label: 'RCR',
        data: rcr,
        backgroundColor: alpha(REGION.RCR, 0.7),
        borderColor: REGION.RCR,
        borderWidth: 1,
        borderRadius: 0,
        barPercentage: 0.85,
        categoryPercentage: 0.9,
        yAxisID: 'y',
        stack: 'region',
        order: 3,
      },
      {
        type: 'bar',
        label: 'CCR',
        data: ccr,
        backgroundColor: alpha(REGION.CCR, 0.7),
        borderColor: REGION.CCR,
        borderWidth: 1,
        borderRadius: 0,
        barPercentage: 0.85,
        categoryPercentage: 0.9,
        yAxisID: 'y',
        stack: 'region',
        order: 3,
      },
      // Quantum line (unchanged)
      {
        type: 'line',
        label: 'Quantum',
        data: quantum,
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
        stacked: true,
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
        stacked: true,
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

  const totalTransactions = totalCounts.reduce((sum, c) => sum + c, 0);
  const totalQuantum = quantum.reduce((sum, v) => sum + v, 0);
  const totalCCR = ccr.reduce((s, v) => s + v, 0);
  const totalRCR = rcr.reduce((s, v) => s + v, 0);
  const totalOCR = ocr.reduce((s, v) => s + v, 0);

  return (
    <ChartFrame
      status={isBackgroundLoading ? 'pending' : status}
      isFiltering={false}
      error={error}
      onRetry={refetch}
      empty={!isBackgroundLoading && labels.length === 0}
      skeleton="bar"
      height={height}
      staggerIndex={staggerIndex}
    >
      <DataCard variant={embedded ? 'embedded' : 'standalone'}>
        {/* Layer 1: Header */}
        <DataCardHeader
          title="HDB Resale · $1M+ Transactions"
          logic="Count of HDB resale transactions ≥ $1M by region. Quantum = total value."
          info={`Transactions — HDB resale transaction count at or above $1,000,000, broken down by market region.
CCR = Core Central Region (D01-D02, D06-D07, D09-D11)
RCR = Rest of Central Region (D03-D05, D08, D12-D15, D20)
OCR = Outside Central Region (D16-D19, D21-D28)
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
            label="Region Split"
            value={totalTransactions > 0
              ? `${Math.round(totalOCR / totalTransactions * 100)}% OCR`
              : '—'}
            subtext={totalTransactions > 0
              ? `${totalCCR} CCR · ${totalRCR} RCR · ${totalOCR} OCR`
              : 'no data'}
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
          left={<StatusPeriod>{labels.length} Periods ({TIME_LABELS[timeGrouping]})</StatusPeriod>}
          right={<StatusCount count={totalTransactions} />}
        >
          <LegendLine label="CCR" color={REGION.CCR} />
          <LegendLine label="RCR" color={REGION.RCR} />
          <LegendLine label="OCR" color={REGION.OCR} />
          <LegendLine label="Quantum" color={CHART_COLORS.navy} />
        </StatusDeck>
      </DataCard>
    </ChartFrame>
  );
}

export const HdbMillionDollarChart = React.memo(HdbMillionDollarChartBase);

export default HdbMillionDollarChart;
