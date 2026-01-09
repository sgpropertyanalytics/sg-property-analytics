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
 *
 * PERFORMANCE: Uses shared SupplyDataContext to eliminate duplicate API calls.
 * Multiple instances of this chart (regional + district views) share the same data.
 *
 * The adapter (waterfallAdapter.js) handles ALL data transformation and spacer math.
 * This component is a pure renderer - no business logic.
 */

import React, { useRef, useMemo } from 'react';
// Chart.js core components registered globally in chartSetup.js
import { registerPlugin } from '../../chartSetup';
import { Bar } from 'react-chartjs-2';
import { useSupplyData } from '../../context/SupplyDataContext';
import { ChartFrame } from '../common/ChartFrame';
import { ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  transformRegionalWaterfall,
  transformDistrictWaterfall,
  getWaterfallChartOptions,
  getDistrictChartOptions,
  waterfallConnectorPlugin,
} from '../../adapters/supply/waterfallAdapter';
import { CHART_COLORS } from '../../constants/colors';

// Register custom waterfall connector plugin (chart-specific)
registerPlugin(waterfallConnectorPlugin);

/**
 * Supply Waterfall Chart Component
 *
 * @param {{
 *  view?: 'regional'|'district',
 *  selectedRegion?: string | null,
 *  includeGls?: boolean,
 *  launchYear?: number,
 *  height?: number,
 * }} props
 */
function SupplyWaterfallChartBase({
  view = 'regional',
  selectedRegion = null,
  // Props kept for documentation but values come from shared context
  includeGls: _includeGls,
  launchYear: _launchYear,
  height = 350,
}) {
  const chartRef = useRef(null);

  // Consume shared data from context (single fetch for all supply components)
  const { data: apiResponse, loading, error, refetch, includeGls, isFetching, isFiltering } = useSupplyData();

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
    <ChartFrame
      loading={loading}
      isFetching={isFetching}
      isFiltering={isFiltering}
      error={error}
      onRetry={refetch}
      empty={!chartData || !chartData.labels?.length}
      skeleton="bar"
      height={height}
    >
      <div
        className="weapon-card hud-corner weapon-shadow overflow-hidden flex flex-col"
        style={{ height }}
      >
        {/* Header */}
        <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-mono-muted shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-brand-navy text-sm md:text-base">
              {chartTitle}
            </h3>
            <p className="text-xs text-brand-blue mt-0.5">
              {chartData?.displayMeta?.subtitle || 'Supply pipeline breakdown'}
            </p>
          </div>
        </div>

        {/* Legend */}
        {view === 'regional' && (
          <div className="px-3 py-2 bg-brand-sand/20 border-b border-brand-sky/20 shrink-0">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="text-brand-blue font-medium">Supply:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: CHART_COLORS.supplyUnsold }} />
                <span className="text-brand-navy">Unsold Inventory</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: CHART_COLORS.supplyUpcoming }} />
                <span className="text-brand-navy">Upcoming Launches</span>
              </div>
              {includeGls && (
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: CHART_COLORS.supplyGls }} />
                  <span className="text-brand-navy">GLS Pipeline</span>
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
            <div className="flex items-center justify-center h-full text-brand-blue">
              <div className="text-center">
                <p className="text-sm">No supply data available</p>
                <p className="text-xs mt-1">Try adjusting the launch year</p>
              </div>
            </div>
          )}
        </ChartSlot>

        {/* Footer */}
        <div className="shrink-0 h-11 px-4 bg-brand-sand/30 border-t border-brand-sky/30 flex items-center justify-between gap-3 text-xs text-brand-blue">
          <span className="truncate min-w-0 flex-1">
            {view === 'district'
              ? `Showing ${selectedRegion} districts`
              : selectedRegion
                ? `Filtered to ${selectedRegion}`
                : 'All regions combined'
            }
          </span>
          <span className="text-[10px] shrink-0 hidden sm:block">
            As of: {chartData?.displayMeta?.asOf || 'N/A'}
            {chartData?.displayMeta?.launchYear && (
              <> | Launch Year: {chartData.displayMeta.launchYear}</>
            )}
          </span>
        </div>
      </div>
    </ChartFrame>
  );
}

export const SupplyWaterfallChart = React.memo(SupplyWaterfallChartBase);

export default SupplyWaterfallChart;
