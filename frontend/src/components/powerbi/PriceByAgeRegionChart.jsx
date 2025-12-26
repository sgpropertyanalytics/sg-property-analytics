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
import { getPriceByAgeRegion } from '../../api/client';
import { transformPriceByAgeRegion, toPriceByAgeRegionChartData } from '../../adapters/aggregateAdapter';
import { QueryState } from '../common/QueryState';
import { ChartSlot } from '../ui/ChartSlot';
import { baseChartJsOptions } from '../../constants/chartOptions';
import { formatPrice } from '../../constants';

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

const BEDROOM_ORDER = ['1BR', '2BR', '3BR', '4BR', '5BR+'];

/**
 * Custom plugin to draw P50 median line markers on horizontal floating bars
 * Creates a box-plot style visualization with vertical median markers
 */
const medianLinePlugin = {
  id: 'medianLineHorizontal',
  afterDatasetsDraw(chart) {
    const { ctx, scales } = chart;
    const xScale = scales.x;
    const yScale = scales.y;

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      const p50Values = dataset.p50Values;

      if (!p50Values || !meta.visible) return;

      meta.data.forEach((bar, index) => {
        const p50 = p50Values[index];
        if (p50 == null || !bar) return;

        const barHeight = bar.height;
        const barY = bar.y;
        const p50X = xScale.getPixelForValue(p50);

        // Draw median line (white with shadow for visibility)
        ctx.save();

        // Shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;

        // White median line (vertical for horizontal bars)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p50X, barY - barHeight / 2 + 2);
        ctx.lineTo(p50X, barY + barHeight / 2 - 2);
        ctx.stroke();

        ctx.restore();
      });
    });
  },
};

/**
 * Custom plugin to draw horizontal separator lines between age bucket groups
 */
const horizontalSeparatorPlugin = {
  id: 'horizontalSeparator',
  beforeDraw(chart) {
    const { ctx, scales, chartArea } = chart;
    const yScale = scales.y;

    if (!yScale || !chartArea) return;

    const labels = chart.data.labels || [];
    if (labels.length < 2) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 180, 193, 0.4)'; // Light separator color
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]); // Dashed line

    // Draw line between each age bucket group (every 3 labels since CCR/RCR/OCR per bucket)
    for (let i = 2; i < labels.length; i += 3) {
      if (i >= labels.length - 1) continue;

      const y1 = yScale.getPixelForValue(i);
      const y2 = yScale.getPixelForValue(i + 1);
      const separatorY = (y1 + y2) / 2;

      ctx.beginPath();
      ctx.moveTo(chartArea.left, separatorY);
      ctx.lineTo(chartArea.right, separatorY);
      ctx.stroke();
    }

    ctx.restore();
  },
};

/**
 * PriceByAgeRegionChart - Horizontal grouped floating bar chart
 *
 * Shows total transaction price percentiles (P25/P50/P75) grouped by:
 * - Y-axis: Age Bucket × Region combinations (e.g., "Recently TOP - CCR")
 * - X-axis: Total Price ($)
 * - Colors: Bedroom type (1BR-5BR+)
 *
 * Compliance:
 * - Per LEGAL_COMPLIANCE.md: Aggregated data only
 * - K-anonymity (K=15) applied server-side
 * - Cells with fewer than 15 observations are suppressed
 * - No individual transaction data exposed
 */
export function PriceByAgeRegionChart({ height = 400 }) {
  const chartRef = useRef(null);
  const { buildApiParams, debouncedFilterKey, applyCrossFilter } = usePowerBIFilters();

  // Mobile: bedroom selector state
  const [selectedBedroom, setSelectedBedroom] = useState(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Fetch price by age region data
  const { data: rawData, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({});

      const response = await getPriceByAgeRegion(params, { signal });
      return response.data;
    },
    [debouncedFilterKey],
    { initialData: null }
  );

  // Transform data using adapter
  const transformedData = useMemo(() => {
    if (!rawData) return null;
    return transformPriceByAgeRegion(rawData);
  }, [rawData]);

  // Convert to Chart.js format
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

    return toPriceByAgeRegionChartData(dataToUse, BEDROOM_COLORS);
  }, [transformedData, isMobile, selectedBedroom]);

  // Chart.js options for horizontal stacked/overlapping bars
  const options = useMemo(
    () => ({
      ...baseChartJsOptions,
      indexAxis: 'y', // HORIZONTAL bars
      scales: {
        y: {
          type: 'category',
          stacked: true, // Stack bars on same y-position (overlapping)
          title: {
            display: true,
            text: 'Age Bucket × Region',
            color: '#547792',
            font: { size: 12, weight: '500' },
            padding: { bottom: 8 },
          },
          grid: {
            display: false,
          },
          ticks: {
            color: '#547792',
            font: { size: 10, weight: '500' },
            padding: 4,
          },
          border: {
            display: true,
            color: 'rgba(148, 180, 193, 0.5)',
          },
        },
        x: {
          type: 'linear',
          position: 'bottom',
          stacked: true, // Enable stacking on x-axis for floating bars to overlap
          title: {
            display: true,
            text: 'Total Price ($)',
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
            callback: (value) => formatPrice(value),
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
              const category = chartData.labels[ctx[0].dataIndex];
              return `${ctx[0].dataset.label} @ ${category}`;
            },
            label: (ctx) => {
              const [p25, p75] = ctx.raw || [null, null];
              const p50Values = ctx.dataset.p50Values;
              const p50 = p50Values?.[ctx.dataIndex];

              if (p25 === null || p75 === null) {
                return 'Insufficient data';
              }

              // Get observation count from transformed data
              const category = chartData.labels[ctx.dataIndex];
              const bedroom = ctx.dataset.label;
              const bedroomData = transformedData?.byCategory?.get(category)?.get(bedroom);

              const lines = [
                `P75: ${formatPrice(p75)}`,
                `P50: ${formatPrice(p50)} (median)`,
                `P25: ${formatPrice(p25)}`,
              ];

              if (bedroomData?.observationCount) {
                lines.push(`Based on ${bedroomData.observationCount} transactions`);
              }

              return lines;
            },
          },
        },
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const datasetIndex = elements[0].datasetIndex;
          const bedroom = chartData.datasets[datasetIndex]?.label;
          if (bedroom) {
            // Extract bedroom count from label (e.g., "2BR" -> 2)
            const match = bedroom.match(/(\d+)/);
            if (match) {
              applyCrossFilter('bedroom', 'bedroom', parseInt(match[1], 10));
            }
          }
        }
      },
    }),
    [isMobile, transformedData, chartData, applyCrossFilter]
  );

  // Calculate stats for footer
  const stats = useMemo(() => {
    if (!transformedData?.hasData) {
      return { totalObservations: 0, categoryCount: 0, bedroomCount: 0 };
    }
    return {
      totalObservations: transformedData.meta?.totalObservations || 0,
      categoryCount: transformedData.categories.length,
      bedroomCount: transformedData.bedrooms.length,
    };
  }, [transformedData]);

  // Available bedrooms for mobile selector
  const availableBedrooms = transformedData?.bedrooms || [];

  // Card height calculation - taller for more categories
  const cardHeight = height + (isMobile ? 230 : 190);

  return (
    <QueryState
      loading={loading}
      error={error}
      onRetry={refetch}
      empty={!transformedData?.hasData}
      emptyMessage="No price data available for current filters"
    >
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="font-semibold text-[#213448]">
            Price by Property Age & Region
          </h3>
          <p className="text-xs text-[#547792] mt-1">
            How do transaction prices vary across lifecycle stages and market segments?
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

        {/* How to read box */}
        <div className="px-4 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20 shrink-0">
          <p className="text-xs text-[#547792] leading-relaxed">
            <span className="font-medium text-[#213448]">How to read:</span>{' '}
            Each bar shows P25-P75 price range. White line = median (P50).
            Longer bars = more price variability.
          </p>
        </div>

        {/* Chart */}
        <ChartSlot>
          <Bar
            ref={chartRef}
            data={chartData}
            options={options}
            plugins={[medianLinePlugin, horizontalSeparatorPlugin]}
          />
        </ChartSlot>

        {/* Footer */}
        <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
          <span>
            {stats.totalObservations.toLocaleString()} observations across {stats.categoryCount} groups
          </span>
          <span className="text-[#94B4C1]">
            White line = median (P50)
          </span>
        </div>
      </div>
    </QueryState>
  );
}

export default PriceByAgeRegionChart;
