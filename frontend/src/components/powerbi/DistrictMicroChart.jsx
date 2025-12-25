import React, { useRef, useMemo } from 'react';
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

// Region-based header colors (more prominent for clarity)
const REGION_HEADER_BG = {
  CCR: 'bg-[#213448]', // Deep Navy - solid
  RCR: 'bg-[#547792]', // Ocean Blue - solid
  OCR: 'bg-[#94B4C1]', // Sky Blue - solid
};

// Region-based text colors for headers
const REGION_HEADER_TEXT = {
  CCR: 'text-white',
  RCR: 'text-white',
  OCR: 'text-[#213448]',
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

  // Determine region for header styling
  const region = getRegionForDistrict(district);
  const headerBg = REGION_HEADER_BG[region] || REGION_HEADER_BG.OCR;
  const headerText = REGION_HEADER_TEXT[region] || REGION_HEADER_TEXT.OCR;

  // Standard line color (black for all charts)
  const lineColor = '#1f2937'; // Dark gray/black

  // Calculate local min/max and growth metrics
  const { latestPsf, minPsf, maxPsf, paddedMin, paddedMax, growthPercent } = useMemo(() => {
    if (!data || data.length === 0) {
      return { latestPsf: null, minPsf: 0, maxPsf: 0, paddedMin: 0, paddedMax: 0, growthPercent: null };
    }

    const psfValues = data.map(d => d.medianPsf).filter(v => v > 0);
    if (psfValues.length === 0) {
      return { latestPsf: null, minPsf: 0, maxPsf: 0, paddedMin: 0, paddedMax: 0, growthPercent: null };
    }

    const min = Math.min(...psfValues);
    const max = Math.max(...psfValues);
    const range = max - min;
    const padding = range * 0.1; // 10% padding on each side

    // Get first and last valid PSF for growth calculation
    const firstPsf = data.find(d => d.medianPsf > 0)?.medianPsf;
    const lastPsf = [...data].reverse().find(d => d.medianPsf > 0)?.medianPsf;
    const growth = firstPsf && lastPsf ? ((lastPsf - firstPsf) / firstPsf) * 100 : null;

    return {
      latestPsf: lastPsf,
      minPsf: min,
      maxPsf: max,
      paddedMin: Math.max(0, min - padding),
      paddedMax: max + padding,
      growthPercent: growth,
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
          borderColor: lineColor, // Standard black line for all charts
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointBackgroundColor: lineColor,
          tension: 0.3,
          yAxisID: 'y1',
          order: 1, // Render on top
        },
      ],
    };
  }, [data, lineColor]);

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
          <span className={`text-xs font-semibold truncate ${headerText}`}>{district}</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-xs text-[#94B4C1]">
          No data
        </div>
      </div>
    );
  }

  // Determine growth color for text - use high contrast colors on dark backgrounds
  const isDarkHeader = region === 'CCR' || region === 'RCR';
  const growthTextColor = growthPercent === null
    ? (isDarkHeader ? 'text-white/70' : 'text-[#94B4C1]')
    : growthPercent >= 0
      ? (isDarkHeader ? 'text-[#86efac]' : 'text-emerald-600')  // Bright mint green on dark
      : (isDarkHeader ? 'text-[#fca5a5]' : 'text-red-500');     // Bright coral red on dark

  return (
    <div className="h-full flex flex-col bg-white rounded border border-[#94B4C1]/50 overflow-hidden hover:border-[#547792] transition-colors">
      {/* Header with district code and growth KPI - shaded by region */}
      <div className={`px-2 py-1.5 border-b border-[#94B4C1]/30 shrink-0 flex items-center justify-between gap-1 ${headerBg}`}>
        <span className={`text-xs font-semibold truncate ${headerText}`} title={DISTRICT_NAMES[district]}>
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
        <span className="text-[9px] text-[#547792] truncate flex-1" title={DISTRICT_NAMES[district]}>
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
