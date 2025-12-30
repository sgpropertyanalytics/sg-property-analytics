import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { BASE_CHART_OPTIONS, CHART_AXIS_DEFAULTS } from '../constants/chartOptions';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

/**
 * Lines of Code Trend Chart
 *
 * Displays the growth of the codebase over time (by commit progression).
 * Data is captured at snapshot points in the git history.
 */

// LOC data captured from git history (sampled at regular intervals)
// Each point represents LOC count at a specific commit number
const LOC_DATA = [
  { label: 'Commit 1', loc: 91750, commitNum: 1 },
  { label: 'Commit 20', loc: 92200, commitNum: 20 },
  { label: 'Commit 35', loc: 92213, commitNum: 35 },
  { label: 'Commit 50', loc: 98255, commitNum: 50 },
  { label: 'Commit 65', loc: 101764, commitNum: 65 },
  { label: 'Commit 80', loc: 101351, commitNum: 80 },
  { label: 'Commit 95', loc: 101813, commitNum: 95 },
  { label: 'Commit 110', loc: 101695, commitNum: 110 },
  { label: 'Commit 125', loc: 101677, commitNum: 125 },
  { label: 'Commit 140', loc: 100246, commitNum: 140 },
  { label: 'Commit 155', loc: 100156, commitNum: 155 },
  { label: 'Commit 169', loc: 101062, commitNum: 169 },
  { label: 'Current', loc: 102340, commitNum: 170 },
];

export function LocTrendChart({ height = 280 }) {
  const chartData = useMemo(() => ({
    labels: LOC_DATA.map(d => d.label),
    datasets: [
      {
        label: 'Lines of Code',
        data: LOC_DATA.map(d => d.loc),
        backgroundColor: LOC_DATA.map((_, i) =>
          i === LOC_DATA.length - 1
            ? 'rgba(33, 52, 72, 0.9)' // Navy for current
            : 'rgba(84, 119, 146, 0.7)' // Slate blue for historical
        ),
        borderColor: LOC_DATA.map((_, i) =>
          i === LOC_DATA.length - 1
            ? '#213448'
            : '#547792'
        ),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }), []);

  const options = useMemo(() => ({
    ...BASE_CHART_OPTIONS,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        titleColor: '#EAE0CF',
        bodyColor: '#94B4C1',
        borderColor: 'rgba(148, 180, 193, 0.3)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        titleFont: { weight: '600', size: 13 },
        bodyFont: { size: 12 },
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            return `  ${value.toLocaleString()} lines`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          maxRotation: 45,
          minRotation: 45,
          font: { size: 10 },
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        min: 85000, // Start near the minimum to show growth better
        border: { display: false },
        title: {
          display: true,
          text: 'Lines of Code',
          ...CHART_AXIS_DEFAULTS.title,
        },
        grid: {
          color: 'rgba(148, 180, 193, 0.15)',
          drawTicks: false,
        },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => `${(value / 1000).toFixed(0)}K`,
          padding: 8,
        },
      },
    },
  }), []);

  // Calculate stats
  const currentLoc = LOC_DATA[LOC_DATA.length - 1].loc;
  const initialLoc = LOC_DATA[0].loc;
  const growth = ((currentLoc - initialLoc) / initialLoc * 100).toFixed(1);
  const totalCommits = LOC_DATA[LOC_DATA.length - 1].commitNum;

  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-[#EAE0CF]/30 border-b border-[#94B4C1]/20">
        <h3 className="text-base font-semibold text-[#213448]">Codebase Growth</h3>
        <p className="text-xs text-[#547792] mt-0.5">Lines of code over commit history</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-[#94B4C1]/20">
        <div className="text-center">
          <div className="text-lg font-bold text-[#213448]">{currentLoc.toLocaleString()}</div>
          <div className="text-[10px] text-[#547792] uppercase tracking-wide">Current LOC</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-emerald-600">+{growth}%</div>
          <div className="text-[10px] text-[#547792] uppercase tracking-wide">Growth</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[#213448]">{totalCommits}</div>
          <div className="text-[10px] text-[#547792] uppercase tracking-wide">Commits</div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4" style={{ height }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}

export default LocTrendChart;
