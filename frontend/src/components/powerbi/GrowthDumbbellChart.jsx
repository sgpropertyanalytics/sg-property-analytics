import React, { useState, useMemo } from 'react';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery } from '../../hooks';
// Phase 3.4: Using standardized Zustand filters (bedroom only - ignores time filter)
import { useZustandFilters } from '../../stores';
import { ChartFrame } from '../common/ChartFrame';
import { getAggregate } from '../../api/client';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS, DISTRICT_NAMES, getRegionForDistrict } from '../../constants';
import { SaleType } from '../../schemas/apiContract';
import { transformGrowthDumbbellSeries, logFetchDebug, assertKnownVersion } from '../../adapters';

// All districts
const ALL_DISTRICTS = [...CCR_DISTRICTS, ...RCR_DISTRICTS, ...OCR_DISTRICTS];


// Region header colors (matching micro-charts)
const REGION_HEADER_BG = {
  CCR: 'bg-[#213448]',
  RCR: 'bg-[#547792]',
  OCR: 'bg-[#94B4C1]',
};

const REGION_HEADER_TEXT = {
  CCR: 'text-white',
  RCR: 'text-white',
  OCR: 'text-[#213448]',
};


// Get full area names (no truncation for wide column)
const getAreaNames = (district) => {
  return DISTRICT_NAMES[district] || district;
};

// Gradient color based on rank position (0 = top, 1 = bottom)
// Dark green (#047857) → Dark amber/yellow (#b45309)
const getGradientColor = (rankPercent) => {
  // HSL interpolation: Green (160°) → Amber (35°)
  // Saturation: 85% → 75%
  // Lightness: 25% → 32%
  const hue = 160 - (rankPercent * 125); // 160 → 35
  const sat = 85 - (rankPercent * 10);   // 85% → 75%
  const lit = 25 + (rankPercent * 7);    // 25% → 32%
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
};

/**
 * GrowthDumbbellChart - Dumbbell chart of Median PSF Growth %
 *
 * A dumbbell/gap chart showing baseline vs latest quarter median PSF for each district,
 * with sortable columns and absolute PSF increment.
 *
 * IMPORTANT: This chart INTENTIONALLY ignores time filter.
 * It compares the earliest 3 completed months (baseline quarter) against
 * the latest 3 completed months (current quarter) across the FULL database.
 * This is by design to show long-term growth trajectory.
 *
 * Phase 3.4: Uses Zustand for bedroom filter only, NOT time filter.
 *
 * @param {{
 *  saleType?: string,
 *  enabled?: boolean,
 * }} props
 */
function GrowthDumbbellChartBase({ saleType = SaleType.RESALE, enabled = true }) {
  // Phase 3.4: Using standardized Zustand filters (bedroom only)
  // INTENTIONAL: This chart ignores time filter - uses full DB range for growth comparison
  const { filters } = useZustandFilters();

  // Derive bedroom from Zustand (but NOT timeframe - intentionally ignored)
  const bedroom = filters.bedroomTypes.length > 0
    ? filters.bedroomTypes.join(',')
    : '';

  const [sortConfig, setSortConfig] = useState({ column: 'growth', order: 'desc' });

  // Data fetching with useAppQuery - gates on appReady
  // Phase 4: Inline query key - no filterKey abstraction
  // enabled prop prevents fetching when component is hidden (e.g., in volume mode)
  const { data, status, error, refetch } = useAppQuery(
    async (signal) => {
      // Build API params - NO timeframe filter, uses full database range
      // INTENTIONAL: This chart compares earliest vs latest quarters across all data
      const params = {
        group_by: 'quarter,district',
        metrics: 'median_psf',
        sale_type: saleType,
      };

      // Add bedroom filter from Zustand
      if (bedroom) {
        params.bedroom = bedroom;
      }

      // NO timeframe - intentionally uses full DB range

      const response = await getAggregate(params, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/aggregate');

      const rawData = response.data || [];

      // Debug logging (dev only)
      logFetchDebug('GrowthDumbbellChart', {
        endpoint: '/api/aggregate',
        timeGrain: 'quarter,district',
        response: response.data,
        rowCount: rawData.length,
      });

      // Use adapter for transformation
      return transformGrowthDumbbellSeries(rawData, { districts: ALL_DISTRICTS });
    },
    [bedroom, saleType],
    { chartName: 'GrowthDumbbellChart', initialData: null, enabled }
  );

  // Default fallback for when data is null (initial load) - matches PriceDistributionChart pattern
  const { chartData: baseChartData, startQuarter, endQuarter, excludedDistricts = [] } = data ?? {
    chartData: [],
    startQuarter: '',
    endQuarter: '',
    excludedDistricts: [],
  };

  // Add region and areaNames (display-only metadata) to chart data
  const chartData = useMemo(() => {
    return baseChartData.map(item => ({
      ...item,
      region: getRegionForDistrict(item.district),
      areaNames: getAreaNames(item.district),
    }));
  }, [baseChartData]);

  // Sort data based on sortConfig
  const sortedData = useMemo(() => {
    if (chartData.length === 0) return [];

    const sorted = [...chartData];
    sorted.sort((a, b) => {
      let aVal, bVal;

      switch (sortConfig.column) {
        case 'district':
          aVal = a.district;
          bVal = b.district;
          break;
        case 'area':
          aVal = a.areaNames;
          bVal = b.areaNames;
          break;
        case 'startPsf':
          aVal = a.startPsf;
          bVal = b.startPsf;
          break;
        case 'endPsf':
          aVal = a.endPsf;
          bVal = b.endPsf;
          break;
        case 'increment':
          aVal = a.endPsf - a.startPsf;
          bVal = b.endPsf - b.startPsf;
          break;
        case 'growth':
        default:
          aVal = a.growthPercent;
          bVal = b.growthPercent;
          break;
      }

      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return sortConfig.order === 'asc' ? cmp : -cmp;
      }

      return sortConfig.order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return sorted;
  }, [chartData, sortConfig]);

  // Handle sort
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'desc' ? 'asc' : 'desc'
    }));
  };

  // Sort icon component (matching other tables)
  const SortIcon = ({ column }) => {
    const isActive = sortConfig.column === column;
    return (
      <span className={`ml-1 ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
        {isActive ? (sortConfig.order === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    );
  };

  // Format price as full number with commas (e.g., $1,436)
  const formatPrice = (value) => {
    return `$${Math.round(value).toLocaleString()}`;
  };

  // Handle district click - no cross-filter since we're not using PowerBIFilterContext
  // This is a visual-only interaction for now (could add onClick prop in future)
  const handleDistrictClick = (_district) => {
    // No-op: District clicks don't cross-filter in District Deep Dive
    // The heatmap controls the filters, not individual chart interactions
  };

  return (
    <ChartFrame
      status={status}
      error={error}
      onRetry={refetch}
      empty={!sortedData || sortedData.length === 0}
      skeleton="bar"
      height={400}
    >
    <div className="bg-card rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header with title */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#213448]">
              Dumbbell Chart of Median PSF Growth %
            </h3>
            <p className="text-xs text-[#547792] mt-0.5">
              Comparing {startQuarter} (earliest) → {endQuarter} (latest) • Click headers to sort
            </p>
          </div>
          {/* Dot Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-slate-300 border border-white shadow-sm" />
              <span className="text-[#547792]">Earliest Quarter</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 border border-white shadow-sm" />
              <span className="text-[#547792]">Latest Quarter</span>
            </div>
          </div>
        </div>
      </div>

      {/* Column Headers - CSS Grid layout */}
      <div className="px-3 md:px-4 py-2 bg-slate-50 border-b border-slate-200">
        <div
          className="grid items-center gap-x-3 text-[10px] md:text-xs font-medium text-slate-600"
          style={{ gridTemplateColumns: 'minmax(180px, 280px) 1fr 90px 90px 70px 55px' }}
        >
          <div
            className="cursor-pointer hover:text-slate-800 select-none"
            onClick={() => handleSort('district')}
          >
            District<SortIcon column="district" />
          </div>
          <div className="text-center text-slate-400 text-[10px]">
            Growth
          </div>
          <div
            className="text-right cursor-pointer hover:text-slate-800 select-none leading-tight"
            onClick={() => handleSort('startPsf')}
            title={`Baseline Median PSF (${startQuarter})`}
          >
            <span className="hidden md:inline">Baseline PSF</span>
            <span className="md:hidden">Base</span>
            <span className="block text-[9px] text-slate-400 font-normal">({startQuarter})</span>
          </div>
          <div
            className="text-right cursor-pointer hover:text-slate-800 select-none leading-tight"
            onClick={() => handleSort('endPsf')}
            title={`Median PSF (${endQuarter})`}
          >
            <span className="hidden md:inline">Latest PSF</span>
            <span className="md:hidden">Latest</span>
            <span className="block text-[9px] text-slate-400 font-normal">({endQuarter})</span>
          </div>
          <div
            className="text-right cursor-pointer hover:text-slate-800 select-none"
            onClick={() => handleSort('increment')}
            title="Absolute PSF change"
          >
            Δ PSF<SortIcon column="increment" />
          </div>
          <div
            className="text-right cursor-pointer hover:text-slate-800 select-none"
            onClick={() => handleSort('growth')}
          >
            Growth<SortIcon column="growth" />
          </div>
        </div>
      </div>

      {/* Dumbbell Rows */}
      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
        {sortedData.map((item, index) => {
          // Left-aligned dumbbell: baseline at 0%, latest position based on growth
          // Scale: 0% growth = 10%, 100% growth = 100%
          const growthClamped = Math.max(0, Math.min(item.growthPercent, 100));
          const latestDotPosition = 10 + (growthClamped / 100) * 90; // 10% to 100%

          // Gradient color based on rank position (top = green, bottom = amber)
          const rankPercent = sortedData.length > 1 ? index / (sortedData.length - 1) : 0;
          const gradientColor = getGradientColor(rankPercent);

          // Slightly muted version for the line
          const lineOpacity = 0.7;

          const regionBg = REGION_HEADER_BG[item.region] || REGION_HEADER_BG.OCR;
          const regionText = REGION_HEADER_TEXT[item.region] || REGION_HEADER_TEXT.OCR;

          return (
            <div
              key={item.district}
              className="px-3 md:px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors group"
              onClick={() => handleDistrictClick(item.district)}
              title={`${DISTRICT_NAMES[item.district]}\nBaseline: ${formatPrice(item.startPsf)} → Latest: ${formatPrice(item.endPsf)}`}
            >
              {/* CSS Grid row - matches header */}
              <div
                className="grid items-center gap-x-3"
                style={{ gridTemplateColumns: 'minmax(180px, 280px) 1fr 90px 90px 70px 55px' }}
              >
                {/* Column 1: District - full name, wider column */}
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${regionBg} ${regionText}`}>
                    {item.district}
                  </span>
                  <span className="text-xs text-slate-600 leading-tight" title={DISTRICT_NAMES[item.district]}>
                    {item.areaNames}
                  </span>
                </div>

                {/* Column 2: Dumbbell (left-aligned, baseline at left) */}
                <div className="relative h-5">
                  {/* Background track */}
                  <div className="absolute left-0 right-0 bg-slate-100 rounded-full" style={{ top: '50%', height: '2px', transform: 'translateY(-50%)' }} />

                  {/* Connecting line from baseline to latest - thicker (5px) with gradient color */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: '0',
                      width: `${latestDotPosition}%`,
                      height: '5px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: gradientColor,
                      opacity: lineOpacity,
                    }}
                  />

                  {/* Baseline dot (always at left) */}
                  <div
                    className="absolute rounded-full bg-slate-400 border border-white shadow-sm"
                    style={{
                      left: '0',
                      top: '50%',
                      width: '8px',
                      height: '8px',
                      transform: 'translateY(-50%)',
                    }}
                  />

                  {/* Latest dot (position based on growth) - uses gradient color */}
                  <div
                    className="absolute rounded-full border-2 border-white shadow-md z-10"
                    style={{
                      left: `${latestDotPosition}%`,
                      top: '50%',
                      width: '10px',
                      height: '10px',
                      transform: 'translate(-50%, -50%)',
                      backgroundColor: gradientColor,
                    }}
                  />
                </div>

                {/* Column 3: Baseline PSF - full digits with commas */}
                <div className="text-right">
                  <span className="text-xs text-slate-500">
                    {formatPrice(item.startPsf)}
                  </span>
                </div>

                {/* Column 4: Latest PSF - full digits with commas */}
                <div className="text-right">
                  <span className="text-xs font-medium text-slate-700">
                    {formatPrice(item.endPsf)}
                  </span>
                </div>

                {/* Column 5: Δ PSF (Increment) */}
                <div className="text-right">
                  <span className="text-xs font-medium" style={{ color: gradientColor }}>
                    {item.growthPercent >= 0 ? '+' : ''}{formatPrice(item.endPsf - item.startPsf)}
                  </span>
                </div>

                {/* Column 6: Growth % */}
                <div className="text-right">
                  <span className="text-xs font-bold" style={{ color: gradientColor }}>
                    {item.growthPercent >= 0 ? '+' : ''}{item.growthPercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer - minimal legend */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
          {/* Legend */}
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-300"></span>
              <span>Baseline ({startQuarter})</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>Latest ({endQuarter})</span>
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3">
            <span>{chartData.length} districts</span>
            {excludedDistricts.length > 0 && (
              <span className="text-amber-600" title={excludedDistricts.map(d => `${d.district}: ${d.reason}`).join(', ')}>
                {excludedDistricts.length} excluded
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
    </ChartFrame>
  );
}

export const GrowthDumbbellChart = React.memo(GrowthDumbbellChartBase);

export default GrowthDumbbellChart;
