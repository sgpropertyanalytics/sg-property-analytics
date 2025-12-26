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
import { transformPsfByPriceBand, toPsfByPriceBandChartData } from '../../adapters/aggregateAdapter';
import { QueryState } from '../common/QueryState';
import { ChartSlot } from '../ui/ChartSlot';
import { baseChartJsOptions } from '../../constants/chartOptions';

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
 * PsfByPriceBandChart - Compliant grouped floating bar chart
 *
 * Shows PSF percentiles (P25/P50/P75) grouped by price band and bedroom type.
 * Each bar represents the P25-P75 range with P50 marked.
 *
 * Compliance:
 * - Per LEGAL_COMPLIANCE.md: Aggregated data only
 * - K-anonymity (K=15) applied server-side
 * - Cells with fewer than 15 observations are suppressed
 * - No individual transaction data exposed
 */
export function PsfByPriceBandChart({ height = 350 }) {
  const chartRef = useRef(null);
  const { buildApiParams, debouncedFilterKey, applyCrossFilter } = usePowerBIFilters();

  // Mobile: bedroom selector state
  const [selectedBedroom, setSelectedBedroom] = useState(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Fetch PSF by price band data
  const { data: rawData, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({});

      const response = await getPsfByPriceBand(params, { signal });
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

  // Convert to Chart.js format
  const chartData = useMemo(() => {
    if (!transformedData?.hasData) {
      return { labels: [], datasets: [] };
    }

    // On mobile with bedroom selector, filter to single bedroom
    if (isMobile && selectedBedroom) {
      const filteredData = {
        ...transformedData,
        bedrooms: [selectedBedroom],
      };
      return toPsfByPriceBandChartData(filteredData, BEDROOM_COLORS);
    }

    return toPsfByPriceBandChartData(transformedData, BEDROOM_COLORS);
  }, [transformedData, isMobile, selectedBedroom]);

  // Chart.js options for floating bar
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
            font: { size: 12 },
          },
          grid: { display: false },
          ticks: {
            color: '#547792',
            font: { size: 10 },
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'PSF ($/sqft)',
            color: '#547792',
            font: { size: 12 },
          },
          grid: { color: 'rgba(148, 180, 193, 0.2)' },
          ticks: {
            color: '#547792',
            callback: (value) => `$${value.toLocaleString()}`,
          },
          beginAtZero: false,
        },
      },
      plugins: {
        legend: {
          display: !isMobile, // Hide legend on mobile (we have tabs instead)
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'rect',
            padding: 15,
            color: '#213448',
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(33, 52, 72, 0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(148, 180, 193, 0.5)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: (ctx) => {
              if (ctx.length === 0) return '';
              return `${ctx[0].dataset.label} @ ${ctx[0].label}`;
            },
            label: (ctx) => {
              const [p25, p75] = ctx.raw || [null, null];
              const p50Values = ctx.dataset.p50Values;
              const p50 = p50Values?.[ctx.dataIndex];

              if (p25 === null || p75 === null) {
                return 'Insufficient data';
              }

              const lines = [
                `P75: $${Math.round(p75).toLocaleString()} PSF`,
                `P50: $${Math.round(p50).toLocaleString()} PSF (median)`,
                `P25: $${Math.round(p25).toLocaleString()} PSF`,
              ];

              // Get observation count from transformed data
              const priceBand = ctx.label;
              const bedroom = ctx.dataset.label;
              const bedroomData = transformedData?.byPriceBand?.get(priceBand)?.get(bedroom);
              if (bedroomData?.observationCount) {
                lines.push(`Based on ${bedroomData.observationCount} observations`);
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
    [isMobile, transformedData, chartData.datasets, applyCrossFilter]
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

        {/* Key insight box */}
        <div className="px-4 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20 shrink-0">
          <p className="text-xs text-[#547792] leading-relaxed">
            <span className="font-medium text-[#213448]">How to read:</span>{' '}
            Each bar shows the P25-P75 PSF range. Overlapping bars indicate similar value across bedroom types.
            Taller bars = higher price variance.
          </p>
        </div>

        {/* Chart */}
        <ChartSlot>
          <Bar ref={chartRef} data={chartData} options={options} />
        </ChartSlot>

        {/* Footer */}
        <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
          <span>
            {stats.totalObservations.toLocaleString()} observations across {stats.priceBandCount} price bands
          </span>
          <span className="text-[#94B4C1]">
            Bars show P25-P75 range
          </span>
        </div>
      </div>
    </QueryState>
  );
}

export default PsfByPriceBandChart;
