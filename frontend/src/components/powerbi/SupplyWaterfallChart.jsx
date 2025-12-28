/**
 * Supply Waterfall Chart - Pure Renderer Component
 *
 * Displays the Supply Accumulator waterfall visualization showing:
 * - Unsold Inventory (Deep Navy)
 * - Upcoming Launches (Ocean Blue)
 * - GLS Pipeline (Sky Blue / Grey when excluded)
 * - Total Effective Supply (Sand/Cream)
 *
 * IMPORTANT: This component does NOT use usePowerBIFilters().
 * Per CLAUDE.md Card 13, Supply Insights page uses local state, not sidebar filters.
 * All filters are passed as props from the parent component.
 *
 * The adapter (waterfallAdapter.js) handles ALL data transformation and spacer math.
 * This component is a pure renderer - no business logic.
 */

import React, { useRef, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import { ChartSlot } from '../ui';
import { getSupplySummary } from '../../api/client';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  transformRegionalWaterfall,
  transformDistrictWaterfall,
  getWaterfallChartOptions,
  getDistrictChartOptions,
  waterfallConnectorPlugin,
} from '../../adapters/supply/waterfallAdapter';

// Register Chart.js components and plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  waterfallConnectorPlugin
);

/**
 * Supply Waterfall Chart Component
 *
 * @param {Object} props
 * @param {'regional'|'district'} props.view - Chart view mode
 * @param {string|null} props.selectedRegion - For district view, which region to show
 * @param {boolean} props.includeGls - Whether to include GLS pipeline in calculations
 * @param {number} props.launchYear - Year filter for upcoming launches
 * @param {number} props.height - Chart height in pixels
 */
export function SupplyWaterfallChart({
  view = 'regional',
  selectedRegion = null,
  includeGls = true,
  launchYear = 2026,
  height = 350,
}) {
  const chartRef = useRef(null);

  // Build filter key for caching/refetch
  const filterKey = useMemo(() =>
    `${view}:${selectedRegion || 'all'}:${includeGls}:${launchYear}`,
    [view, selectedRegion, includeGls, launchYear]
  );

  // Fetch supply data
  const { data: apiResponse, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const params = {
        includeGls,
        launchYear,
      };
      const response = await getSupplySummary(params, { signal });
      return response.data;
    },
    [filterKey], // Refetch when filters change
    { initialData: null }
  );

  // Transform data based on view mode
  // For TRUE waterfall: X-axis is supply stages, region is a filter
  const chartData = useMemo(() => {
    if (!apiResponse) return null;

    if (view === 'district') {
      // District view: stacked bars comparing districts
      // selectedRegion=null shows ALL districts, otherwise filters to region
      return transformDistrictWaterfall(apiResponse, selectedRegion, { includeGls });
    }
    // Regional waterfall: X-axis = stages (Unsold → Upcoming → GLS → Total)
    // selectedRegion filters to one region, null shows all regions combined
    return transformRegionalWaterfall(apiResponse, { region: selectedRegion, includeGls });
  }, [apiResponse, view, selectedRegion, includeGls]);

  // Chart options - different for waterfall vs district stacked bar
  const chartOptions = useMemo(() => {
    if (!chartData?.totals) return baseChartJsOptions;

    if (view === 'district') {
      // District view: stacked bar with legend
      return {
        ...baseChartJsOptions,
        ...getDistrictChartOptions(),
      };
    }

    // Waterfall view: no legend, custom tooltip
    return {
      ...baseChartJsOptions,
      ...getWaterfallChartOptions(chartData.totals, includeGls),
    };
  }, [chartData, view, includeGls]);

  // Chart title based on view
  // TRUE waterfall: title shows what we're looking at
  const chartTitle = view === 'district'
    ? selectedRegion
      ? `${selectedRegion} District Breakdown`
      : 'All Districts Breakdown'
    : selectedRegion
      ? `${selectedRegion} Supply Accumulator`
      : 'Total Supply Accumulator';

  return (
    <QueryState
      loading={loading}
      error={error}
      onRetry={refetch}
      empty={!chartData || !chartData.labels?.length}
      skeleton="bar"
      height={height}
    >
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height }}
      >
        {/* Header */}
        <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[#94B4C1]/30 shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-[#213448] text-sm md:text-base">
              {chartTitle}
            </h3>
            <p className="text-xs text-[#547792] mt-0.5">
              {chartData?.displayMeta?.subtitle || 'Supply pipeline breakdown'}
            </p>
          </div>
        </div>

        {/* Legend */}
        {view === 'regional' && (
          <div className="px-3 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20 shrink-0">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="text-[#547792] font-medium">Supply:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: '#6b4226' }} />
                <span className="text-[#213448]">Unsold Inventory</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: '#9c6644' }} />
                <span className="text-[#213448]">Upcoming Launches</span>
              </div>
              {includeGls && (
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: '#c4a77d' }} />
                  <span className="text-[#213448]">GLS Pipeline</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chart Area */}
        <ChartSlot>
          {chartData?.labels?.length > 0 ? (
            <Bar
              ref={chartRef}
              data={chartData}
              options={chartOptions}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[#547792]">
              <div className="text-center">
                <p className="text-sm">No supply data available</p>
                <p className="text-xs mt-1">Try adjusting the launch year</p>
              </div>
            </div>
          )}
        </ChartSlot>

        {/* Footer */}
        <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
          <span className="truncate">
            {view === 'district'
              ? `Showing ${selectedRegion} districts`
              : selectedRegion
                ? `Filtered to ${selectedRegion}`
                : 'All regions combined'
            }
          </span>
          <span className="text-[10px] shrink-0">
            As of: {chartData?.displayMeta?.asOf || 'N/A'}
            {chartData?.displayMeta?.launchYear && (
              <> | Launch Year: {chartData.displayMeta.launchYear}</>
            )}
          </span>
        </div>
      </div>
    </QueryState>
  );
}

export default SupplyWaterfallChart;
