import React, { useRef, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { useAbortableQuery } from '../../hooks/useAbortableQuery';
import { getPriceByAgeRegion } from '../../api/client';
import { transformPriceByAgeRegion, toPriceByAgeRegionChartData } from '../../adapters/aggregateAdapter';
import { QueryState } from '../common/QueryState';
import { ChartSlot } from '../ui/ChartSlot';
import { baseChartJsOptions } from '../../constants/chartOptions';
import { formatPrice } from '../../constants';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

/**
 * Region tabs - market segments
 */
const REGIONS = ['CCR', 'RCR', 'OCR'];
const REGION_LABELS = {
  CCR: 'Core Central',
  RCR: 'Rest of Central',
  OCR: 'Outside Central',
};

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
 * PriceByAgeRegionChart - Vertical band+line chart with region tabs
 *
 * Shows total transaction price percentiles (P25/P50/P75) by property age:
 * - X-axis: Age Bucket (Recently TOP → Young Resale → Resale → Mature Resale)
 * - Y-axis: Total Price ($)
 * - Colors: Bedroom type (1BR-5BR+)
 * - Bands: P25-P75 range (shows price dispersion)
 * - Lines: P50 median (shows central tendency)
 *
 * Region tabs (CCR/RCR/OCR) allow comparison across market segments.
 *
 * Key insights:
 * - Price decay with age (bands slope down left→right)
 * - Bedroom divergence (2BR vs 3BR gap)
 * - Risk areas (wide bands = high price dispersion)
 *
 * Compliance:
 * - Per LEGAL_COMPLIANCE.md: Aggregated data only
 * - K-anonymity (K=15) applied server-side
 * - Cells with fewer than 15 observations are suppressed
 * - No individual transaction data exposed
 */
export function PriceByAgeRegionChart({ height = 350 }) {
  const chartRef = useRef(null);
  const { buildApiParams, debouncedFilterKey, applyCrossFilter } = usePowerBIFilters();

  // Region tab state
  const [selectedRegion, setSelectedRegion] = useState('RCR');

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

  // Convert to Chart.js format for selected region
  const chartData = useMemo(() => {
    if (!transformedData?.hasData) {
      return { labels: [], datasets: [] };
    }

    const regionData = transformedData.byRegion.get(selectedRegion);
    if (!regionData) {
      return { labels: [], datasets: [] };
    }

    return toPriceByAgeRegionChartData(
      regionData,
      transformedData.ageBuckets,
      transformedData.ageBucketLabels,
      transformedData.bedrooms,
      BEDROOM_COLORS
    );
  }, [transformedData, selectedRegion]);

  // Chart.js options for vertical band+line chart
  const options = useMemo(
    () => ({
      ...baseChartJsOptions,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'category',
          title: {
            display: true,
            text: 'Property Age',
            color: '#547792',
            font: { size: 12, weight: '500' },
          },
          grid: {
            display: false,
          },
          ticks: {
            color: '#547792',
            font: { size: 11, weight: '500' },
            padding: 8,
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
          display: true,
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
            // Filter to show only bedroom bands (not median lines)
            filter: (legendItem) => !legendItem.text.includes('Median'),
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
              const ageBucket = chartData.labels[ctx[0].dataIndex];
              return `${ageBucket} - ${selectedRegion}`;
            },
            label: (ctx) => {
              const dataset = ctx.dataset;
              const isLine = dataset.type === 'line';

              if (isLine) {
                // Median line
                const p50 = ctx.raw;
                return `${dataset.label.replace(' Median', '')} P50: ${formatPrice(p50)}`;
              } else {
                // Band (bar)
                const [p25, p75] = ctx.raw || [null, null];
                if (p25 === null || p75 === null) {
                  return 'Insufficient data';
                }
                return [
                  `${dataset.label} P75: ${formatPrice(p75)}`,
                  `${dataset.label} P25: ${formatPrice(p25)}`,
                ];
              }
            },
          },
        },
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const datasetIndex = elements[0].datasetIndex;
          const dataset = chartData.datasets[datasetIndex];
          // Extract bedroom from label (e.g., "2BR" or "2BR Median")
          const bedroomMatch = dataset?.label?.match(/^(\d+BR\+?)/);
          if (bedroomMatch) {
            const bedroomCount = parseInt(bedroomMatch[1], 10);
            applyCrossFilter('bedroom', 'bedroom', bedroomCount);
          }
        }
      },
    }),
    [chartData, selectedRegion, applyCrossFilter]
  );

  // Calculate stats for footer
  const stats = useMemo(() => {
    if (!transformedData?.hasData) {
      return { totalObservations: 0, ageBucketCount: 0, bedroomCount: 0 };
    }
    return {
      totalObservations: transformedData.meta?.totalObservations || 0,
      ageBucketCount: transformedData.ageBuckets.length,
      bedroomCount: transformedData.bedrooms.length,
    };
  }, [transformedData]);

  // Card height calculation
  const cardHeight = height + 180;

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
        {/* Header with Region Tabs */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-[#213448]">
                Price by Property Age
              </h3>
              <p className="text-xs text-[#547792] mt-0.5">
                How do prices decay as properties age?
              </p>
            </div>

            {/* Region Tabs */}
            <div className="flex gap-1">
              {REGIONS.map((region) => (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  title={REGION_LABELS[region]}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    selectedRegion === region
                      ? 'bg-[#213448] text-white'
                      : 'bg-[#EAE0CF]/50 text-[#547792] hover:bg-[#EAE0CF]'
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* How to read box */}
        <div className="px-4 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20 shrink-0">
          <p className="text-xs text-[#547792] leading-relaxed">
            <span className="font-medium text-[#213448]">How to read:</span>{' '}
            Each colored band shows P25-P75 price range. Lines show median (P50).
            Wider bands = more price variability (higher risk).
          </p>
        </div>

        {/* Chart */}
        <ChartSlot>
          <Chart
            ref={chartRef}
            type="bar"
            data={chartData}
            options={options}
          />
        </ChartSlot>

        {/* Footer */}
        <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
          <span>
            {REGION_LABELS[selectedRegion]} • {stats.ageBucketCount} age groups • {stats.bedroomCount} bedroom types
          </span>
          <span className="text-[#94B4C1]">
            Band = P25-P75 • Line = Median
          </span>
        </div>
      </div>
    </QueryState>
  );
}

export default PriceByAgeRegionChart;
