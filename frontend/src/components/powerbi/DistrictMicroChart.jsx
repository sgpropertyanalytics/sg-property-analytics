import React, { useRef, useMemo, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { BASE_CHART_OPTIONS } from '../../constants/chartOptions';
import { getRegionForDistrict, DISTRICT_NAMES } from '../../constants';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Tooltip
);

// Region-based header background colors (subtle shades)
const REGION_HEADER_BG = {
  CCR: 'bg-[#213448]/10', // Deep Navy tint
  RCR: 'bg-[#547792]/10', // Ocean Blue tint
  OCR: 'bg-[#94B4C1]/10', // Sky Blue tint
};

// Trend-based line colors
const TREND_COLORS = {
  strong_up: '#166534',   // Dark green (emerald-800)
  up: '#16a34a',          // Green (emerald-600)
  neutral: '#1f2937',     // Dark gray/black
  down: '#dc2626',        // Red
  strong_down: '#991b1b', // Dark red
};

/**
 * DistrictMicroChart - Compact combo chart for a single district
 *
 * Shows historical price growth with:
 * - Line: Median PSF (region-colored, 2px)
 * - Bars: Total Transaction Value (grey, 30% opacity)
 * - Independent Y-axes for visual impact
 */
export function DistrictMicroChart({ district, data, onClick }) {
  const chartRef = useRef(null);
  const [gradient, setGradient] = useState(null);

  // Determine region for header background
  const region = getRegionForDistrict(district);
  const headerBg = REGION_HEADER_BG[region] || REGION_HEADER_BG.OCR;

  // Calculate local min/max and growth metrics
  const { latestPsf, minPsf, maxPsf, paddedMin, paddedMax, growthPercent, trendColor } = useMemo(() => {
    if (!data || data.length === 0) {
      return { latestPsf: null, minPsf: 0, maxPsf: 0, paddedMin: 0, paddedMax: 0, growthPercent: null, trendColor: TREND_COLORS.neutral };
    }

    const psfValues = data.map(d => d.medianPsf).filter(v => v > 0);
    if (psfValues.length === 0) {
      return { latestPsf: null, minPsf: 0, maxPsf: 0, paddedMin: 0, paddedMax: 0, growthPercent: null, trendColor: TREND_COLORS.neutral };
    }

    const min = Math.min(...psfValues);
    const max = Math.max(...psfValues);
    const range = max - min;
    const padding = range * 0.1; // 10% padding on each side

    // Get first and last valid PSF for growth calculation
    const firstPsf = data.find(d => d.medianPsf > 0)?.medianPsf;
    const lastPsf = [...data].reverse().find(d => d.medianPsf > 0)?.medianPsf;
    const growth = firstPsf && lastPsf ? ((lastPsf - firstPsf) / firstPsf) * 100 : null;

    // Determine trend color based on growth percentage
    let color = TREND_COLORS.neutral;
    if (growth !== null) {
      if (growth >= 30) color = TREND_COLORS.strong_up;
      else if (growth >= 10) color = TREND_COLORS.up;
      else if (growth <= -20) color = TREND_COLORS.strong_down;
      else if (growth <= -5) color = TREND_COLORS.down;
      else color = TREND_COLORS.neutral;
    }

    return {
      latestPsf: lastPsf,
      minPsf: min,
      maxPsf: max,
      paddedMin: Math.max(0, min - padding),
      paddedMax: max + padding,
      growthPercent: growth,
      trendColor: color,
    };
  }, [data]);

  // Format price for display
  const formatPrice = (value) => {
    if (!value) return '-';
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${Math.round(value)}`;
  };

  // Format growth percentage
  const formatGrowth = (value) => {
    if (value === null || value === undefined) return null;
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(0)}%`;
  };

  // Get district area names (show 2-3 areas, respecting space constraints)
  const areaNames = useMemo(() => {
    const fullName = DISTRICT_NAMES[district] || district;
    const parts = fullName.split('/').map(s => s.trim());

    // Take first 2-3 areas, but keep total length reasonable
    let result = parts[0];
    let count = 1;

    for (let i = 1; i < parts.length && count < 3; i++) {
      const potential = result + ' / ' + parts[i];
      // Keep it short enough to fit (roughly 30 chars max for small cards)
      if (potential.length <= 35) {
        result = potential;
        count++;
      } else {
        break;
      }
    }

    return result;
  }, [district]);

  // Create gradient for line based on trend
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !data || data.length === 0) return;

    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    if (!chartArea) return;

    // Create horizontal gradient from left to right
    const gradientLine = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);

    // Gradient from neutral/lighter to trend color
    const neutralColor = '#9ca3af'; // gray-400
    gradientLine.addColorStop(0, neutralColor);
    gradientLine.addColorStop(0.5, trendColor);
    gradientLine.addColorStop(1, trendColor);

    setGradient(gradientLine);
  }, [data, trendColor]);

  // Chart data configuration
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return { labels: [], datasets: [] };
    }

    return {
      labels: data.map(d => d.quarter),
      datasets: [
        {
          type: 'bar',
          label: 'Transaction Value',
          data: data.map(d => d.totalValue),
          backgroundColor: 'rgba(200, 200, 200, 0.3)',
          borderWidth: 0,
          yAxisID: 'y',
          order: 2, // Render behind line
        },
        {
          type: 'line',
          label: 'Median PSF',
          data: data.map(d => d.medianPsf),
          borderColor: gradient || trendColor, // Use gradient if available, else solid color
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointBackgroundColor: trendColor,
          tension: 0.3,
          yAxisID: 'y1',
          order: 1, // Render on top
        },
      ],
    };
  }, [data, trendColor, gradient]);

  // Chart options - LOCAL SCALING with padded min/max
  const options = useMemo(() => ({
    ...BASE_CHART_OPTIONS,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (ctx) => `${district} - ${ctx[0]?.label || ''}`,
          label: (ctx) => {
            if (ctx.datasetIndex === 1) {
              return `Median PSF: $${ctx.raw?.toLocaleString() || '-'}`;
            }
            const valueInMil = ctx.raw / 1e6;
            return `Total Value: $${valueInMil.toFixed(1)}M`;
          },
        },
      },
    },
    scales: {
      x: { display: false },
      y: {
        display: false,
        beginAtZero: true,
      },
      y1: {
        display: false,
        position: 'right',
        // LOCAL SCALING: Zoom Y-axis to fit this district's specific range
        min: paddedMin,
        max: paddedMax,
      },
    },
    onClick: () => {
      if (onClick) {
        onClick(district);
      }
    },
    onHover: (event, elements) => {
      const canvas = event.native?.target;
      if (canvas) {
        canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    },
  }), [district, onClick, paddedMin, paddedMax]);

  // Handle empty data state
  if (!data || data.length === 0) {
    return (
      <div className="h-full flex flex-col bg-white rounded border border-[#94B4C1]/50 overflow-hidden">
        <div className={`px-2 py-1.5 border-b border-[#94B4C1]/30 shrink-0 flex items-center justify-between ${headerBg}`}>
          <span className="text-xs font-semibold text-[#213448] truncate">{district}</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-xs text-[#94B4C1]">
          No data
        </div>
      </div>
    );
  }

  // Determine growth color for text
  const growthTextColor = growthPercent === null ? 'text-[#94B4C1]'
    : growthPercent >= 0 ? 'text-emerald-600' : 'text-red-500';

  return (
    <div className="h-full flex flex-col bg-white rounded border border-[#94B4C1]/50 overflow-hidden hover:border-[#547792] transition-colors">
      {/* Header with district code and growth KPI - shaded by region */}
      <div className={`px-2 py-1.5 border-b border-[#94B4C1]/30 shrink-0 flex items-center justify-between gap-1 ${headerBg}`}>
        <span className="text-xs font-semibold text-[#213448] truncate" title={DISTRICT_NAMES[district]}>
          {district}
        </span>
        {/* Prominent Growth KPI */}
        {growthPercent !== null && (
          <span className={`text-[11px] font-bold ${growthTextColor} whitespace-nowrap`}>
            {formatGrowth(growthPercent)}
          </span>
        )}
      </div>

      {/* Micro chart */}
      <div className="flex-1 min-h-0 p-1">
        <Chart ref={chartRef} type="bar" data={chartData} options={options} />
      </div>

      {/* Footer with current PSF and area names */}
      <div className="px-2 py-0.5 bg-[#EAE0CF]/20 shrink-0 flex items-center justify-between gap-1">
        <span className="text-[9px] text-[#94B4C1] truncate flex-1" title={DISTRICT_NAMES[district]}>
          {areaNames}
        </span>
        {latestPsf && (
          <span className="text-[9px] font-medium text-[#547792] whitespace-nowrap">
            {formatPrice(latestPsf)}
          </span>
        )}
      </div>
    </div>
  );
}

export default DistrictMicroChart;
