/**
 * PriceGrowthChart - Historical Price Growth Visualization
 *
 * Displays PSF trend and cumulative growth % for a project's resale transactions.
 * Includes district average as a reference line for comparison.
 *
 * Visual Elements:
 * - Project median PSF line (solid navy, left Y-axis)
 * - Cumulative growth % line (dashed ocean blue, right Y-axis)
 * - District average PSF line (dotted sky blue, left Y-axis)
 */

import React, { useMemo, useRef } from 'react';
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
import { ChartSlot } from '../ui';
import { baseChartJsOptions, CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { ChartSkeleton } from '../common/ChartSkeleton';

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

// Colors
const COLORS = {
  navy: '#213448',
  oceanBlue: '#547792',
  skyBlue: '#94B4C1',
  sand: '#EAE0CF',
};

// Helper: Calculate median
const median = (arr) => {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].filter(v => v != null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Helper: Calculate mean
const mean = (arr) => {
  if (!arr || arr.length === 0) return null;
  const valid = arr.filter(v => v != null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
};

// Helper: Aggregate transactions to quarterly data
const aggregateByQuarter = (transactions) => {
  if (!transactions || transactions.length === 0) return [];

  const quarters = {};

  transactions.forEach(txn => {
    if (!txn.transaction_date || txn.psf == null) return;

    const date = new Date(txn.transaction_date);
    const q = Math.ceil((date.getMonth() + 1) / 3);
    const qKey = `${date.getFullYear()}-Q${q}`;

    if (!quarters[qKey]) {
      quarters[qKey] = { psf: [], growth: [] };
    }

    quarters[qKey].psf.push(txn.psf);

    if (txn.cumulative_growth_pct != null) {
      quarters[qKey].growth.push(txn.cumulative_growth_pct);
    }
  });

  return Object.entries(quarters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, data]) => ({
      quarter,
      medianPsf: median(data.psf),
      avgGrowth: mean(data.growth),
      txnCount: data.psf.length,
    }));
};

export const PriceGrowthChart = React.memo(function PriceGrowthChart({
  data = null,
  districtAverage = [],
  loading = false,
  error = null,
  projectName = '',
  district = '',
  height = 400,
}) {
  const chartRef = useRef(null);

  // Transform transaction data to quarterly aggregates
  const aggregatedData = useMemo(() => {
    if (!data?.data || data.data.length === 0) return [];
    return aggregateByQuarter(data.data);
  }, [data]);

  // Build chart data
  const chartData = useMemo(() => {
    if (aggregatedData.length === 0) return null;

    const labels = aggregatedData.map(d => d.quarter);
    const psfData = aggregatedData.map(d => d.medianPsf);
    const growthData = aggregatedData.map(d => d.avgGrowth);

    // Match district average to quarters (if available)
    const districtData = labels.map(quarter => {
      const match = districtAverage.find(d => d.quarter === quarter);
      return match?.median_psf ?? null;
    });

    return {
      labels,
      datasets: [
        // Project median PSF (left Y-axis)
        {
          label: `${projectName || 'Project'} Median PSF`,
          data: psfData,
          borderColor: COLORS.navy,
          backgroundColor: COLORS.navy,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          yAxisID: 'y',
          order: 1,
        },
        // District average PSF (left Y-axis, dotted)
        ...(districtData.some(d => d != null) ? [{
          label: `${district || 'District'} Average PSF`,
          data: districtData,
          borderColor: COLORS.skyBlue,
          backgroundColor: COLORS.skyBlue,
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          yAxisID: 'y',
          order: 3,
        }] : []),
        // Cumulative growth % (right Y-axis)
        {
          label: 'Cumulative Growth %',
          data: growthData,
          borderColor: COLORS.oceanBlue,
          backgroundColor: COLORS.oceanBlue,
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.3,
          yAxisID: 'y1',
          order: 2,
        },
      ],
    };
  }, [aggregatedData, districtAverage, projectName, district]);

  // Chart options with dual Y-axis
  const options = useMemo(() => {
    return {
      ...baseChartJsOptions,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'line',
            boxWidth: 30,
            padding: 15,
            font: { size: 11 },
            color: COLORS.oceanBlue,
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(33, 52, 72, 0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: COLORS.skyBlue,
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx !== undefined && aggregatedData[idx]) {
                return aggregatedData[idx].quarter;
              }
              return '';
            },
            label: (context) => {
              const value = context.parsed?.y;
              if (value == null) return null;

              if (context.dataset.yAxisID === 'y1') {
                return `${context.dataset.label}: ${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
              }
              return `${context.dataset.label}: $${Math.round(value).toLocaleString()} psf`;
            },
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx !== undefined && aggregatedData[idx]) {
                return [`Transactions: ${aggregatedData[idx].txnCount}`];
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
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
          title: {
            display: true,
            text: 'Quarter',
            ...CHART_AXIS_DEFAULTS.title,
          },
        },
        y: {
          position: 'left',
          grid: { color: `${COLORS.skyBlue}30` },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            callback: (value) => `$${value.toLocaleString()}`,
          },
          title: {
            display: true,
            text: 'PSF ($/sqft)',
            ...CHART_AXIS_DEFAULTS.title,
          },
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            ...CHART_AXIS_DEFAULTS.ticks,
            callback: (value) => `${value >= 0 ? '+' : ''}${value}%`,
          },
          title: {
            display: true,
            text: 'Cumulative Growth (%)',
            ...CHART_AXIS_DEFAULTS.title,
          },
        },
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false,
      },
    };
  }, [aggregatedData]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!data?.data || data.data.length === 0) return null;

    const txns = data.data;
    const growthValues = txns
      .map(t => t.cumulative_growth_pct)
      .filter(v => v != null);

    const latestGrowth = growthValues.length > 0
      ? growthValues[growthValues.length - 1]
      : null;

    const firstDate = txns[0]?.transaction_date;
    const lastDate = txns[txns.length - 1]?.transaction_date;

    return {
      totalTransactions: txns.length,
      latestGrowth,
      dateRange: firstDate && lastDate
        ? `${firstDate.slice(0, 7)} to ${lastDate.slice(0, 7)}`
        : null,
    };
  }, [data]);

  // Loading state
  if (loading) {
    return <ChartSkeleton type="line" height={height} />;
  }

  // Error state
  if (error) {
    return (
      <div
        className="bg-card rounded-lg border border-[#94B4C1]/50 flex flex-col overflow-hidden"
        style={{ height }}
      >
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="font-semibold text-[#213448]">Price Growth</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-red-500 mb-2">Error loading data</div>
            <div className="text-sm text-[#547792]">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!chartData || aggregatedData.length === 0) {
    return (
      <div
        className="bg-card rounded-lg border border-[#94B4C1]/50 flex flex-col overflow-hidden"
        style={{ height }}
      >
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="font-semibold text-[#213448]">Price Growth</h3>
          <p className="text-xs text-[#547792] mt-1">Historical PSF trend and growth</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-50">📈</div>
            <div className="text-[#547792]">
              {projectName
                ? 'Insufficient transaction data for this project'
                : 'Select a project to view price growth'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main chart view
  return (
    <div
      className="bg-card rounded-lg border border-[#94B4C1]/50 flex flex-col overflow-hidden"
      style={{ height }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[#213448] truncate">
              Price Growth
              {projectName && (
                <span className="font-normal text-[#547792]"> — {projectName}</span>
              )}
            </h3>
            <p className="text-xs text-[#547792] mt-1">
              Quarterly median PSF and cumulative growth from first transaction
              {district && (
                <span className="ml-2 px-2 py-0.5 bg-[#EAE0CF]/50 text-[#547792] rounded text-xs">
                  vs {district} avg
                </span>
              )}
            </p>
          </div>

          {/* Growth badge */}
          {stats?.latestGrowth != null && (
            <div className={`
              px-3 py-1.5 rounded-lg text-sm font-semibold
              ${stats.latestGrowth >= 0
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
              }
            `}>
              {stats.latestGrowth >= 0 ? '+' : ''}{stats.latestGrowth.toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <ChartSlot>
        <Line ref={chartRef} data={chartData} options={options} />
      </ChartSlot>

      {/* Footer */}
      <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between text-xs text-[#547792]">
        <span>
          {stats?.totalTransactions || 0} transactions •{' '}
          {aggregatedData.length} quarters
        </span>
        {stats?.dateRange && (
          <span className="text-[#213448]">
            {stats.dateRange}
          </span>
        )}
      </div>
    </div>
  );
});

export default PriceGrowthChart;
