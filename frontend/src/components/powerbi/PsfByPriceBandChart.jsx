import React, { useRef, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { useAbortableQuery } from '../../hooks/useAbortableQuery';
import { getPsfByPriceBand } from '../../api/client';
import { transformPsfByPriceBand, toPsfByPriceBandChartData, assertKnownVersion } from '../../adapters/aggregateAdapter';
import { QueryState } from '../common/QueryState';
import { ChartSlot } from '../ui/ChartSlot';
import { baseChartJsOptions } from '../../constants/chartOptions';
import { BEDROOM_ORDER } from '../../constants';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/**
 * Bedroom colors from CLAUDE.md color palette
 * Each bedroom type gets a distinct color for visual differentiation
 */
const BEDROOM_COLORS = {
  '1BR': { bg: 'rgba(247, 190, 129, 0.85)', border: '#f7be81' }, // Orange
  '2BR': { bg: 'rgba(79, 129, 189, 0.85)', border: '#4f81bd' },   // Blue
  '3BR': { bg: 'rgba(40, 82, 122, 0.85)', border: '#28527a' },    // Dark blue
  '4BR': { bg: 'rgba(17, 43, 60, 0.85)', border: '#112b3c' },     // Navy
  '5BR+': { bg: 'rgba(155, 187, 89, 0.85)', border: '#9bbb59' },  // Green
};

/**
 * Custom plugin to draw P50 median line markers on floating bars
 * Creates a box-plot style visualization
 */
const medianLinePlugin = {
  id: 'medianLine',
  afterDatasetsDraw(chart) {
    const { ctx, scales } = chart;
    const yScale = scales.y;

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      const p50Values = dataset.p50Values;

      if (!p50Values || !meta.visible) return;

      meta.data.forEach((bar, index) => {
        const p50 = p50Values[index];
        if (p50 == null || !bar) return;

        const barWidth = bar.width;
        const barX = bar.x;
        const p50Y = yScale.getPixelForValue(p50);

        // Draw median line (white with shadow for visibility)
        ctx.save();

        // Shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;

        // White median line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(barX - barWidth / 2 + 2, p50Y);
        ctx.lineTo(barX + barWidth / 2 - 2, p50Y);
        ctx.stroke();

        ctx.restore();
      });
    });
  },
};

/**
 * Custom plugin to draw vertical separator lines between price bands
 */
const verticalSeparatorPlugin = {
  id: 'verticalSeparator',
  beforeDraw(chart) {
    const { ctx, scales, chartArea } = chart;
    const xScale = scales.x;

    if (!xScale || !chartArea) return;

    const labels = chart.data.labels || [];
    if (labels.length < 2) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 180, 193, 0.4)'; // Light separator color
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]); // Dashed line

    // Draw line between each price band
    for (let i = 0; i < labels.length - 1; i++) {
      const x1 = xScale.getPixelForValue(i);
      const x2 = xScale.getPixelForValue(i + 1);
      const separatorX = (x1 + x2) / 2;

      ctx.beginPath();
      ctx.moveTo(separatorX, chartArea.top);
      ctx.lineTo(separatorX, chartArea.bottom);
      ctx.stroke();
    }

    ctx.restore();
  },
};

/**
 * Region colors for CCR/RCR/OCR shading
 */
const REGION_COLORS = {
  CCR: 'rgba(33, 52, 72, 0.85)',    // Deep Navy
  RCR: 'rgba(84, 119, 146, 0.85)',  // Ocean Blue
  OCR: 'rgba(148, 180, 193, 0.85)', // Sky Blue
};

/**
 * Custom plugin to draw region indicator stripe at bottom of each bar
 * Shows dominant region with a thin colored stripe
 */
const regionIndicatorPlugin = {
  id: 'regionIndicator',
  afterDatasetsDraw(chart, args, options) {
    const { ctx, scales } = chart;
    const yScale = scales.y;

    if (!options?.transformedData) return;

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta.visible) return;

      meta.data.forEach((bar, index) => {
        if (!bar || !dataset.data[index]) return;

        const priceBand = chart.data.labels[index];
        const bedroom = dataset.label;
        const bedroomData = options.transformedData?.byPriceBand?.get(priceBand)?.get(bedroom);

        if (!bedroomData) return;

        const ccrCount = bedroomData.ccrCount || 0;
        const rcrCount = bedroomData.rcrCount || 0;
        const ocrCount = bedroomData.ocrCount || 0;
        const total = ccrCount + rcrCount + ocrCount;

        if (total === 0) return;

        // Draw a thin stripe at the bottom of the bar showing region mix
        const barWidth = bar.width;
        const barX = bar.x;
        const [p25] = dataset.data[index];
        const barBottom = yScale.getPixelForValue(p25);
        const stripeHeight = 4;

        // Calculate widths for each region
        const ccrWidth = (ccrCount / total) * barWidth;
        const rcrWidth = (rcrCount / total) * barWidth;
        const ocrWidth = (ocrCount / total) * barWidth;

        let currentX = barX - barWidth / 2;

        ctx.save();

        // Draw CCR portion
        if (ccrWidth > 0) {
          ctx.fillStyle = REGION_COLORS.CCR;
          ctx.fillRect(currentX, barBottom - stripeHeight, ccrWidth, stripeHeight);
          currentX += ccrWidth;
        }

        // Draw RCR portion
        if (rcrWidth > 0) {
          ctx.fillStyle = REGION_COLORS.RCR;
          ctx.fillRect(currentX, barBottom - stripeHeight, rcrWidth, stripeHeight);
          currentX += rcrWidth;
        }

        // Draw OCR portion
        if (ocrWidth > 0) {
          ctx.fillStyle = REGION_COLORS.OCR;
          ctx.fillRect(currentX, barBottom - stripeHeight, ocrWidth, stripeHeight);
        }

        ctx.restore();
      });
    });
  },
};

/**
 * Calculate best value zone - lowest median PSF with tight IQR (low volatility)
 */
const findBestValueZone = (transformedData) => {
  if (!transformedData?.hasData) return null;

  const candidates = [];
  const { byPriceBand, priceBands, bedrooms } = transformedData;

  priceBands.forEach((priceBand) => {
    bedrooms.forEach((bedroom) => {
      const data = byPriceBand.get(priceBand)?.get(bedroom);
      if (!data || data.suppressed || data.p25 == null || data.p75 == null || data.p50 == null) {
        return;
      }

      const iqr = data.p75 - data.p25;
      const iqrPercent = (iqr / data.p50) * 100; // IQR as percentage of median

      // Calculate dominant region
      const ccrCount = data.ccrCount || 0;
      const rcrCount = data.rcrCount || 0;
      const ocrCount = data.ocrCount || 0;
      const total = ccrCount + rcrCount + ocrCount;
      const dominantRegion = total > 0 ? (
        ccrCount >= rcrCount && ccrCount >= ocrCount ? 'CCR' :
        rcrCount >= ocrCount ? 'RCR' : 'OCR'
      ) : null;

      candidates.push({
        priceBand,
        bedroom,
        p50: data.p50,
        iqr,
        iqrPercent,
        observationCount: data.observationCount,
        avgAge: data.avgAge,
        dominantRegion,
        // Lower score = better value (low median + low volatility)
        // Normalize: p50 score + iqr penalty
        score: data.p50 + (iqrPercent * 10), // Weight volatility
      });
    });
  });

  if (candidates.length === 0) return null;

  // Sort by score (ascending) - best value first
  candidates.sort((a, b) => a.score - b.score);

  // Return top candidate as best value
  const best = candidates[0];

  // Also find if there's a clear "best value zone" (multiple good options)
  const threshold = best.score * 1.1; // Within 10% of best
  const bestZone = candidates.filter((c) => c.score <= threshold);

  return {
    best,
    zone: bestZone,
    insight: `${best.bedroom} at ${best.priceBand} shows strong value stability`,
  };
};

/**
 * PsfByPriceBandChart - Compliant grouped floating bar chart with box-plot styling
 *
 * Shows PSF percentiles (P25/P50/P75) grouped by price band and bedroom type.
 * Each bar represents the P25-P75 range with P50 marked as a median line.
 *
 * Compliance:
 * - Per LEGAL_COMPLIANCE.md: Aggregated data only
 * - K-anonymity (K=15) applied server-side
 * - Cells with fewer than 15 observations are suppressed
 * - No individual transaction data exposed
 */
export function PsfByPriceBandChart({ height = 350 }) {
  const chartRef = useRef(null);
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();

  // Mobile: bedroom selector state
  const [selectedBedroom, setSelectedBedroom] = useState(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Fetch PSF by price band data
  const { data: rawData, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({});

      const response = await getPsfByPriceBand(params, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/psf-by-price-band');

      return response.data;
    },
    [debouncedFilterKey],
    { initialData: null }
  );

  // Transform data using adapter
  const transformedData = useMemo(() => {
    if (!rawData) return null;
    return transformPsfByPriceBand(rawData);
  }, [rawData]);

  // Calculate best value zone
  const bestValue = useMemo(() => {
    return findBestValueZone(transformedData);
  }, [transformedData]);

  // Convert to Chart.js format with enhanced styling
  const chartData = useMemo(() => {
    if (!transformedData?.hasData) {
      return { labels: [], datasets: [] };
    }

    // On mobile with bedroom selector, filter to single bedroom
    let dataToUse = transformedData;
    if (isMobile && selectedBedroom) {
      dataToUse = {
        ...transformedData,
        bedrooms: [selectedBedroom],
      };
    }

    const baseData = toPsfByPriceBandChartData(dataToUse, BEDROOM_COLORS);

    // Enhance datasets with better spacing and best value highlighting
    baseData.datasets = baseData.datasets.map((dataset) => {
      const isBestValueBedroom = bestValue?.best?.bedroom === dataset.label;

      return {
        ...dataset,
        // Wider bars with tighter spacing
        barPercentage: 0.9,
        categoryPercentage: 0.92,
        // Highlight best value bedroom with stronger border
        borderWidth: isBestValueBedroom ? 2.5 : 1,
        borderColor: isBestValueBedroom ? '#22c55e' : dataset.borderColor, // Green border for best
      };
    });

    return baseData;
  }, [transformedData, isMobile, selectedBedroom, bestValue]);

  // Short labels for X-axis
  const shortLabels = useMemo(() => {
    return {
      '$0.5M-1M': '0.5-1M',
      '$1M-1.5M': '1-1.5M',
      '$1.5M-2M': '1.5-2M',
      '$2M-2.5M': '2-2.5M',
      '$2.5M-3M': '2.5-3M',
      '$3M-3.5M': '3-3.5M',
      '$3.5M-4M': '3.5-4M',
      '$4M-5M': '4-5M',
      '$5M+': '5M+',
    };
  }, []);

  // Chart.js options for floating bar with box-plot style
  const options = useMemo(
    () => ({
      ...baseChartJsOptions,
      indexAxis: 'x', // Vertical bars
      scales: {
        x: {
          type: 'category',
          title: {
            display: true,
            text: 'Price Band',
            color: '#547792',
            font: { size: 12, weight: '500' },
            padding: { top: 8 },
          },
          grid: {
            display: false,
          },
          ticks: {
            color: '#547792',
            font: { size: 10, weight: '500' },
            maxRotation: 0, // Keep labels horizontal for consistency
            minRotation: 0,
            padding: 4,
            // Use short labels
            callback: function (value, index) {
              const label = this.getLabelForValue(index);
              return shortLabels[label] || label;
            },
          },
          border: {
            display: true,
            color: 'rgba(148, 180, 193, 0.5)',
          },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'PSF ($/sqft)',
            color: '#547792',
            font: { size: 12, weight: '500' },
          },
          grid: {
            color: 'rgba(148, 180, 193, 0.15)',
            drawBorder: false,
          },
          ticks: {
            color: '#547792',
            font: { size: 10 },
            callback: (value) => `$${value.toLocaleString()}`,
            padding: 8,
          },
          beginAtZero: false,
          border: {
            display: false,
          },
        },
      },
      plugins: {
        legend: {
          display: !isMobile, // Hide legend on mobile (we have tabs instead)
          position: 'top',
          align: 'center',
          labels: {
            usePointStyle: true,
            pointStyle: 'rect',
            padding: 16,
            color: '#213448',
            font: { size: 11, weight: '500' },
            boxWidth: 12,
            boxHeight: 12,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(33, 52, 72, 0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(148, 180, 193, 0.5)',
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            title: (ctx) => {
              if (ctx.length === 0) return '';
              const fullLabel = chartData.labels[ctx[0].dataIndex];
              return `${ctx[0].dataset.label} @ ${fullLabel}`;
            },
            label: (ctx) => {
              const [p25, p75] = ctx.raw || [null, null];
              const p50Values = ctx.dataset.p50Values;
              const p50 = p50Values?.[ctx.dataIndex];

              if (p25 === null || p75 === null) {
                return 'Insufficient data';
              }

              const iqr = p75 - p25;
              const iqrPercent = ((iqr / p50) * 100).toFixed(1);

              // Get observation count and other data from transformed data
              const priceBand = chartData.labels[ctx.dataIndex];
              const bedroom = ctx.dataset.label;
              const bedroomData = transformedData?.byPriceBand?.get(priceBand)?.get(bedroom);

              const lines = [
                `P75: $${Math.round(p75).toLocaleString()} PSF`,
                `P50: $${Math.round(p50).toLocaleString()} PSF (median)`,
                `P25: $${Math.round(p25).toLocaleString()} PSF`,
                `Spread: ${iqrPercent}% (${iqr < 300 ? 'tight' : iqr < 500 ? 'moderate' : 'wide'})`,
              ];

              // Add average property age if available
              if (bedroomData?.avgAge != null) {
                const ageLabel = bedroomData.avgAge < 5 ? 'New' :
                                 bedroomData.avgAge < 10 ? 'Young' :
                                 bedroomData.avgAge < 20 ? 'Mature' : 'Older';
                lines.push(`Avg Age: ${bedroomData.avgAge.toFixed(0)} yrs (${ageLabel})`);
              }

              // Add region breakdown
              const ccrCount = bedroomData?.ccrCount || 0;
              const rcrCount = bedroomData?.rcrCount || 0;
              const ocrCount = bedroomData?.ocrCount || 0;
              const total = ccrCount + rcrCount + ocrCount;
              if (total > 0) {
                const ccrPct = Math.round((ccrCount / total) * 100);
                const rcrPct = Math.round((rcrCount / total) * 100);
                const ocrPct = Math.round((ocrCount / total) * 100);
                lines.push(`Region: ${ccrPct}% CCR | ${rcrPct}% RCR | ${ocrPct}% OCR`);
              }

              if (bedroomData?.observationCount) {
                lines.push(`Based on ${bedroomData.observationCount} observations`);
              }

              // Flag if this is best value
              if (bestValue?.best?.priceBand === priceBand && bestValue?.best?.bedroom === bedroom) {
                lines.push('★ Best Value Zone');
              }

              return lines;
            },
          },
        },
      },
    }),
    [isMobile, transformedData, chartData, shortLabels, bestValue]
  );

  // Calculate stats for footer
  const stats = useMemo(() => {
    if (!transformedData?.hasData) {
      return { totalObservations: 0, priceBandCount: 0, bedroomCount: 0 };
    }
    return {
      totalObservations: transformedData.meta?.totalObservations || 0,
      priceBandCount: transformedData.priceBands.length,
      bedroomCount: transformedData.bedrooms.length,
    };
  }, [transformedData]);

  // Available bedrooms for mobile selector
  const availableBedrooms = transformedData?.bedrooms || [];

  // Card height calculation
  const cardHeight = height + (isMobile ? 230 : 190);

  return (
    <QueryState
      loading={loading}
      error={error}
      onRetry={refetch}
      empty={!transformedData?.hasData}
      emptyMessage="No PSF data available for current filters"
      skeleton="bar"
      height={400}
    >
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="font-semibold text-[#213448]">
            PSF by Price Band & Bedroom
          </h3>
          <p className="text-xs text-[#547792] mt-1">
            Which unit types deliver the best value at your budget?
          </p>
        </div>

        {/* Mobile: Bedroom selector tabs */}
        {isMobile && availableBedrooms.length > 0 && (
          <div className="px-4 py-2 border-b border-[#94B4C1]/30 shrink-0 flex gap-1 overflow-x-auto">
            <button
              onClick={() => setSelectedBedroom(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                selectedBedroom === null
                  ? 'bg-[#213448] text-white'
                  : 'bg-[#EAE0CF]/50 text-[#547792] hover:bg-[#EAE0CF]'
              }`}
            >
              All
            </button>
            {BEDROOM_ORDER.filter((br) => availableBedrooms.includes(br)).map((br) => (
              <button
                key={br}
                onClick={() => setSelectedBedroom(br)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  selectedBedroom === br
                    ? 'bg-[#213448] text-white'
                    : 'bg-[#EAE0CF]/50 text-[#547792] hover:bg-[#EAE0CF]'
                }`}
              >
                {br}
              </button>
            ))}
          </div>
        )}

        {/* Best Value Insight Box */}
        <div className="px-4 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20 shrink-0">
          {bestValue?.best ? (
            <p className="text-xs text-[#547792] leading-relaxed">
              <span className="inline-flex items-center gap-1 font-medium text-[#22c55e]">
                <span className="text-sm">★</span> Best Value:
              </span>{' '}
              <span className="text-[#213448] font-medium">{bestValue.best.bedroom}</span> at{' '}
              <span className="text-[#213448] font-medium">{bestValue.best.priceBand}</span>
              {' '}&mdash; ${Math.round(bestValue.best.p50).toLocaleString()} PSF median
              {bestValue.best.avgAge != null && (
                <span className="text-[#547792]">
                  {' '}| Avg {Math.round(bestValue.best.avgAge)}yr old
                </span>
              )}
              {bestValue.best.dominantRegion && (
                <span className="text-[#547792]">
                  {' '}| Mostly {bestValue.best.dominantRegion}
                </span>
              )}
              <span className="text-[#94B4C1]">
                {' '}({bestValue.best.iqrPercent < 15 ? 'tight' : bestValue.best.iqrPercent < 25 ? 'moderate' : 'wide'} spread)
              </span>
            </p>
          ) : (
            <p className="text-xs text-[#547792] leading-relaxed">
              <span className="font-medium text-[#213448]">How to read:</span>{' '}
              Each bar shows P25-P75 range. White line = median (P50). Colored stripe = region mix.
            </p>
          )}
        </div>

        {/* Chart */}
        <ChartSlot>
          <Bar
            ref={chartRef}
            data={chartData}
            options={{
              ...options,
              plugins: {
                ...options.plugins,
                regionIndicator: { transformedData },
              },
            }}
            plugins={[medianLinePlugin, verticalSeparatorPlugin, regionIndicatorPlugin]}
          />
        </ChartSlot>

        {/* Region Legend */}
        <div className="px-4 py-1.5 bg-[#EAE0CF]/10 border-t border-[#94B4C1]/20 shrink-0 flex items-center justify-center gap-4 text-[10px] text-[#547792]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: REGION_COLORS.CCR }} />
            CCR
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: REGION_COLORS.RCR }} />
            RCR
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: REGION_COLORS.OCR }} />
            OCR
          </span>
          <span className="text-[#94B4C1] ml-2">← Bar bottom shows region mix</span>
        </div>

        {/* Footer */}
        <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
          <span>
            {stats.totalObservations.toLocaleString()} observations across {stats.priceBandCount} price bands
          </span>
          <span className="text-[#94B4C1]">
            White line = median (P50)
          </span>
        </div>
      </div>
    </QueryState>
  );
}

export default PsfByPriceBandChart;
