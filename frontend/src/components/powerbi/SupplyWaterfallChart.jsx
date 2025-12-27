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
} from '../../adapters/supply/waterfallAdapter';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend
);

/**
 * Supply Waterfall Chart Component
 *
 * @param {Object} props
 * @param {'regional'|'district'} props.view - Chart view mode
 * @param {string|null} props.selectedRegion - For district view, which region to show
 * @param {boolean} props.includeGls - Whether to include GLS pipeline in calculations
 * @param {number} props.launchYear - Year filter for upcoming launches
 * @param {Function} props.onRegionClick - Callback when a region bar is clicked
 * @param {number} props.height - Chart height in pixels
 */
export function SupplyWaterfallChart({
  view = 'regional',
  selectedRegion = null,
  includeGls = true,
  launchYear = 2026,
  onRegionClick,
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
  const chartData = useMemo(() => {
    if (!apiResponse) return null;

    if (view === 'district' && selectedRegion) {
      return transformDistrictWaterfall(apiResponse, selectedRegion, { includeGls });
    }
    return transformRegionalWaterfall(apiResponse, { includeGls });
  }, [apiResponse, view, selectedRegion, includeGls]);

  // Chart options with click handler
  const chartOptions = useMemo(() => {
    if (!apiResponse) return baseChartJsOptions;

    return {
      ...baseChartJsOptions,
      ...getWaterfallChartOptions(onRegionClick, apiResponse, includeGls),
    };
  }, [apiResponse, onRegionClick, includeGls]);

  // Chart title based on view
  const chartTitle = view === 'district' && selectedRegion
    ? `${selectedRegion} District Supply`
    : 'Regional Supply Pipeline';

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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-[#213448] text-sm md:text-base">
                {chartTitle}
              </h3>
              <p className="text-xs text-[#547792] mt-0.5">
                {chartData?.displayMeta?.subtitle || 'Supply pipeline breakdown'}
              </p>
            </div>

            {/* Total Units Badge */}
            {chartData?.totals && (
              <div className="shrink-0 bg-[#EAE0CF]/50 px-3 py-1.5 rounded-lg">
                <div className="text-[10px] uppercase tracking-wide text-[#547792]">
                  Total Supply
                </div>
                <div className="text-base md:text-lg font-bold text-[#213448]">
                  {chartData.totals.totalEffectiveSupply?.toLocaleString() || 0}
                </div>
              </div>
            )}
          </div>

          {/* KPI Row - Component breakdown */}
          {chartData?.totals && view === 'regional' && (
            <div className="flex flex-wrap items-stretch gap-2 mt-3">
              <SupplyKpiCard
                label="Unsold"
                value={chartData.totals.unsoldInventory}
                color="#213448"
              />
              <SupplyKpiCard
                label="Upcoming"
                value={chartData.totals.upcomingLaunches}
                color="#547792"
              />
              <SupplyKpiCard
                label="GLS"
                value={chartData.totals.glsPipeline}
                color="#94B4C1"
                excluded={!includeGls}
              />
            </div>
          )}
        </div>

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
            {view === 'regional'
              ? 'Click region bar to drill down'
              : `Showing ${selectedRegion} districts`
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

/**
 * Supply KPI Card - Shows a single supply component value
 */
function SupplyKpiCard({ label, value, color, excluded = false }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 text-center min-w-[80px] flex-1 max-w-[110px] ${
        excluded ? 'opacity-50' : ''
      }`}
      style={{ backgroundColor: `${color}15` }}
    >
      <div
        className="text-[10px] uppercase tracking-wide"
        style={{ color: excluded ? '#94B4C1' : color }}
      >
        {label}
        {excluded && ' (off)'}
      </div>
      <div className={`text-base font-bold ${excluded ? 'text-[#94B4C1]' : 'text-[#213448]'}`}>
        {value?.toLocaleString() || 0}
      </div>
    </div>
  );
}

export default SupplyWaterfallChart;
