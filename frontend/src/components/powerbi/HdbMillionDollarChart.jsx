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
import { CHART_COLORS, alpha } from '../../constants/colors';
import { getHdbMillionDollarTrend } from '../../api/client';
import { niceMax } from '../../utils/niceAxisMax';
import { useZustandFilters } from '../../stores';
import { monthToQuarter, monthToYear } from '../../adapters/aggregate/timeAggregation';

/**
 * HDB Million-Dollar Chart — Stacked Bar + Line Combo
 *
 * X-axis: Period (Month/Quarter/Year — controlled by time grouping filter)
 * Y1 (stacked bars, left): Count of $1M+ transactions by URA district
 * Y2 (line, right): Total quantum ($)
 *
 * Data source: data.gov.sg HDB Resale Flat Prices dataset.
 */

const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

// District display names (from constants.py DISTRICT_NAMES)
const DISTRICT_NAMES = {
  D01: 'Raffles Place / Marina',
  D03: 'Queenstown / Tiong Bahru',
  D05: 'Buona Vista / Clementi',
  D08: 'Little India / Farrer Park',
  D12: 'Balestier / Toa Payoh',
  D14: 'Geylang / Paya Lebar',
  D15: 'East Coast / Katong',
  D16: 'Bedok / Upper East Coast',
  D18: 'Tampines / Pasir Ris',
  D19: 'Serangoon / Hougang / Punggol',
  D20: 'Bishan / Ang Mo Kio',
  D21: 'Upper Bukit Timah / Clementi',
  D22: 'Jurong',
  D23: 'Bukit Batok / Bukit Panjang',
  D24: 'Lim Chu Kang / Tengah',
  D25: 'Woodlands',
  D27: 'Yishun / Sembawang',
};

// Color palette for districts — distinct colors, ordered by visual weight
const DISTRICT_COLORS = [
  '#213448', // navy
  '#547792', // ocean
  '#94B4C1', // sky
  '#78503C', // brown
  '#C4A484', // bronze
  '#059669', // emerald
  '#F97316', // orange
  '#2563EB', // blue
  '#DC2626', // red
  '#F59E0B', // amber
  '#6b4226', // supplyDark
  '#9c6644', // supplyMid
  '#c4a77d', // supplyLight
  '#64748B', // slate500
  '#334155', // slate700
  '#94A3B8', // slate400
];

/**
 * Pivot flat rows [{month, district, count, total_quantum}]
 * into per-period structure for stacked bar chart.
 */
function pivotByDistrict(rows, timeGrouping) {
  if (!rows?.length) return { labels: [], districtSeries: {}, quantum: [], districts: [] };

  const convertPeriod = timeGrouping === 'quarter' ? monthToQuarter
    : timeGrouping === 'year' ? monthToYear
      : (m) => m;

  // Accumulate by (period, district)
  const periods = {};
  const districtTotals = {};

  for (const row of rows) {
    const period = convertPeriod(row.month);
    const district = row.district || row.region || 'D19';
    if (!periods[period]) periods[period] = {};
    periods[period][district] = (periods[period][district] || 0) + (row.count ?? 0);
    districtTotals[district] = (districtTotals[district] || 0) + (row.count ?? 0);
  }

  // Compute quantum per period
  const quantumMap = {};
  for (const row of rows) {
    const period = convertPeriod(row.month);
    quantumMap[period] = (quantumMap[period] || 0) + (row.total_quantum ?? 0);
  }

  // Sort districts by total count descending (most active first)
  const sortedDistricts = Object.entries(districtTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([d]) => d);

  // Sort periods chronologically
  const sortedPeriods = Object.keys(periods).sort();

  // Build per-district series
  const districtSeries = {};
  for (const d of sortedDistricts) {
    districtSeries[d] = sortedPeriods.map(p => periods[p][d] || 0);
  }

  return {
    labels: sortedPeriods,
    districtSeries,
    quantum: sortedPeriods.map(p => quantumMap[p] || 0),
    districts: sortedDistricts,
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

  // Pivot into per-district stacked structure
  const { labels, districtSeries, quantum, districts } = useMemo(
    () => pivotByDistrict(rawData, timeGrouping),
    [rawData, timeGrouping],
  );

  // Total count per period (for y-axis scaling)
  const totalCounts = labels.map((_, i) =>
    districts.reduce((sum, d) => sum + (districtSeries[d]?.[i] || 0), 0)
  );
  const maxCount = Math.max(...totalCounts, 1);
  const yAxisMax = niceMax(Math.ceil(maxCount * 1.4));

  const chartData = useMemo(() => ({
    labels,
    datasets: [
      // Stacked bars — one dataset per district (ordered by total count desc)
      ...districts.map((d, idx) => ({
        type: 'bar',
        label: d,
        data: districtSeries[d],
        backgroundColor: alpha(DISTRICT_COLORS[idx % DISTRICT_COLORS.length], 0.75),
        borderColor: DISTRICT_COLORS[idx % DISTRICT_COLORS.length],
        borderWidth: 0.5,
        borderRadius: 0,
        barPercentage: 0.85,
        categoryPercentage: 0.9,
        yAxisID: 'y',
        stack: 'district',
        order: 3,
      })),
      // Quantum line
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
  }), [labels, districts, districtSeries, quantum]);

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
        // Filter out zero-value items from tooltip
        filter: (item) => item.parsed.y > 0,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label === 'Quantum') {
              if (value >= 1_000_000_000) return ` ${label}: $${(value / 1_000_000_000).toFixed(2)}B`;
              return ` ${label}: $${(value / 1_000_000).toFixed(0)}M`;
            }
            const name = DISTRICT_NAMES[label] || label;
            return ` ${label} ${name}: ${value.toLocaleString()} txns`;
          },
        },
      },
      crosshair: {
        line: { color: CHART_COLORS.slate400, width: 1, dashPattern: [4, 4] },
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
        title: { display: true, text: 'Transactions', ...CHART_AXIS_DEFAULTS.title },
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
        title: { display: true, text: 'Quantum ($)', ...CHART_AXIS_DEFAULTS.title },
        grid: { drawOnChartArea: false },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => {
            if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
            return `$${(value / 1_000_000).toFixed(0)}M`;
          },
        },
      },
    },
  }), [yAxisMax]);

  const totalTransactions = totalCounts.reduce((sum, c) => sum + c, 0);
  const totalQuantum = quantum.reduce((sum, v) => sum + v, 0);

  // Top 3 districts for KPI
  const top3 = districts.slice(0, 3).map(d => {
    const count = (districtSeries[d] || []).reduce((s, v) => s + v, 0);
    return `${d}: ${count}`;
  });

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
          logic="Count of HDB resale transactions ≥ $1M by URA district. Quantum = total value."
          info={`Transactions — HDB resale transaction count at or above $1,000,000, broken down by URA postal district.
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
            label="Top Districts"
            value={districts[0] || '—'}
            subtext={top3.join(' · ')}
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
          {districts.slice(0, 6).map((d, i) => (
            <LegendLine key={d} label={d} color={DISTRICT_COLORS[i % DISTRICT_COLORS.length]} />
          ))}
          {districts.length > 6 && <LegendLine label={`+${districts.length - 6} more`} color={CHART_COLORS.slate400} />}
          <LegendLine label="Quantum" color={CHART_COLORS.navy} />
        </StatusDeck>
      </DataCard>
    </ChartFrame>
  );
}

export const HdbMillionDollarChart = React.memo(HdbMillionDollarChartBase);

export default HdbMillionDollarChart;
