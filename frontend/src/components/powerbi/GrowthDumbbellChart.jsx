import React, { useState, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import { getAggregate } from '../../api/client';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS, DISTRICT_NAMES, getRegionForDistrict } from '../../constants';
import { isSaleType } from '../../schemas/apiContract';
import { transformGrowthDumbbellSeries, logFetchDebug, assertKnownVersion } from '../../adapters';

// All districts
const ALL_DISTRICTS = [...CCR_DISTRICTS, ...RCR_DISTRICTS, ...OCR_DISTRICTS];

/**
 * Convert period string to date_from for API
 * @param {string} period - '3m', '6m', '12m', or 'all'
 * @returns {string|null} ISO date string or null for 'all'
 */
function periodToDateFrom(period) {
  if (period === 'all') return null;

  const today = new Date();
  let months = 12; // default

  if (period === '3m') months = 3;
  else if (period === '6m') months = 6;
  else if (period === '12m') months = 12;

  const date = new Date(today);
  date.setMonth(date.getMonth() - months);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

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

// Clean state-based colors for end dot (the "target/outcome")
const getEndDotColor = (growthPercent) => {
  if (growthPercent >= 30) return '#059669';   // Vibrant emerald (strong growth)
  if (growthPercent >= 10) return '#10b981';   // Emerald (growth)
  if (growthPercent <= -20) return '#dc2626';  // Red (strong decline)
  if (growthPercent <= -5) return '#f87171';   // Soft coral (decline)
  return '#64748b';  // Slate grey (neutral)
};

// Line color matches end state but slightly muted
const getLineColor = (growthPercent) => {
  if (growthPercent >= 30) return 'rgba(5, 150, 105, 0.6)';   // Emerald
  if (growthPercent >= 10) return 'rgba(16, 185, 129, 0.5)';  // Lighter emerald
  if (growthPercent <= -20) return 'rgba(220, 38, 38, 0.5)';  // Red
  if (growthPercent <= -5) return 'rgba(248, 113, 113, 0.4)'; // Soft coral
  return 'rgba(100, 116, 139, 0.3)';  // Slate grey
};

// Line thickness based on growth magnitude
const getLineThickness = (growthPercent) => {
  const absGrowth = Math.abs(growthPercent);
  if (absGrowth >= 50) return 6;   // Very strong movement
  if (absGrowth >= 30) return 4;   // Strong movement
  if (absGrowth >= 10) return 2;   // Moderate movement
  return 1;  // Minimal movement
};

// End dot size - larger for strong growth
const getEndDotSize = (growthPercent) => {
  const absGrowth = Math.abs(growthPercent);
  if (absGrowth >= 50) return 20;  // Extra large
  if (absGrowth >= 30) return 18;  // Large
  return 16;  // Standard
};

// Get area names (2-3 areas max, respecting space)
const getAreaNames = (district) => {
  const fullName = DISTRICT_NAMES[district] || district;
  const parts = fullName.split('/').map(s => s.trim());

  let result = parts[0];
  let count = 1;

  for (let i = 1; i < parts.length && count < 3; i++) {
    const potential = result + ' / ' + parts[i];
    if (potential.length <= 40) {
      result = potential;
      count++;
    } else {
      break;
    }
  }

  return result;
};

/**
 * GrowthDumbbellChart - Median PSF Growth Comparison
 *
 * A dumbbell/gap chart showing start vs end median PSF for each district,
 * with sortable columns.
 *
 * IMPORTANT: This component does NOT use PowerBIFilterContext.
 * It receives filters as props from the parent component (DistrictDeepDive).
 * This is intentional - PowerBIFilterContext only affects Market Pulse page.
 *
 * @param {string} period - '3m', '6m', '12m', or 'all'
 * @param {string} bedroom - 'all', '1', '2', '3', '4', '5'
 * @param {string} saleType - 'all', 'New Sale', 'Resale'
 */
export function GrowthDumbbellChart({ period = '12m', bedroom = 'all', saleType = 'all' }) {
  // Create a stable filter key for dependency tracking
  const filterKey = useMemo(() => `${period}:${bedroom}:${saleType}`, [period, bedroom, saleType]);
  const [sortConfig, setSortConfig] = useState({ column: 'growth', order: 'desc' });

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Build API params from props (not PowerBIFilterContext)
      const params = {
        group_by: 'quarter,district',
        metrics: 'median_psf',
      };

      // Add date_from based on period
      const dateFrom = periodToDateFrom(period);
      if (dateFrom) {
        params.date_from = dateFrom;
      }

      // Add bedroom filter
      if (bedroom && bedroom !== 'all') {
        params.bedroom = bedroom;
      }

      // Add sale type filter
      if (saleType && saleType !== 'all') {
        params.sale_type = saleType;
      }

      const response = await getAggregate(params, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/aggregate');

      const rawData = response.data?.data || [];

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
    [filterKey],
    { initialData: { chartData: [], startQuarter: '', endQuarter: '' } }
  );

  // Extract transformed data and add display metadata
  const { chartData: baseChartData, startQuarter, endQuarter } = data;

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

  // Calculate scale for the chart
  const { minPsf, maxPsf } = useMemo(() => {
    if (chartData.length === 0) return { minPsf: 0, maxPsf: 3000 };

    const allPsf = chartData.flatMap(d => [d.startPsf, d.endPsf]);
    const min = Math.min(...allPsf);
    const max = Math.max(...allPsf);
    const padding = (max - min) * 0.1;

    return {
      minPsf: Math.max(0, min - padding),
      maxPsf: max + padding,
    };
  }, [chartData]);

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

  // Convert PSF to percentage position
  const psfToPercent = (psf) => {
    return ((psf - minPsf) / (maxPsf - minPsf)) * 100;
  };

  // Format price
  const formatPrice = (value) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${Math.round(value)}`;
  };

  // Handle district click - no cross-filter since we're not using PowerBIFilterContext
  // This is a visual-only interaction for now (could add onClick prop in future)
  const handleDistrictClick = (_district) => {
    // No-op: District clicks don't cross-filter in District Deep Dive
    // The heatmap controls the filters, not individual chart interactions
  };

  return (
    <QueryState loading={loading} error={error} onRetry={refetch} empty={!sortedData || sortedData.length === 0} skeleton="bar" height={400}>
    <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header with dynamic title */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#213448]">
              Median PSF Growth ({endQuarter} vs {startQuarter})
            </h3>
            <p className="text-xs text-[#547792] mt-0.5">
              Price change from first to latest quarter • Click headers to sort
            </p>
          </div>
          {/* Region Legend */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded bg-[#213448]" />
              <span className="text-[#547792]">CCR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded bg-[#547792]" />
              <span className="text-[#547792]">RCR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded bg-[#94B4C1]" />
              <span className="text-[#547792]">OCR</span>
            </div>
          </div>
        </div>
      </div>

      {/* Column Headers - Sortable (matching other table styling) */}
      <div className="px-3 md:px-4 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center text-xs font-medium text-slate-600">
          <div
            className="w-12 md:w-56 shrink-0 cursor-pointer hover:text-slate-800 select-none"
            onClick={() => handleSort('district')}
          >
            <span className="md:hidden">Dist</span>
            <span className="hidden md:inline">District</span>
            <SortIcon column="district" />
          </div>
          <div className="flex-1 flex justify-between px-1 md:px-2">
            <span
              className="cursor-pointer hover:text-slate-800 select-none text-[10px] md:text-xs"
              onClick={() => handleSort('startPsf')}
            >
              {startQuarter}<SortIcon column="startPsf" />
            </span>
            <span className="text-slate-500 hidden sm:inline">Median PSF</span>
            <span
              className="cursor-pointer hover:text-slate-800 select-none text-[10px] md:text-xs"
              onClick={() => handleSort('endPsf')}
            >
              {endQuarter}<SortIcon column="endPsf" />
            </span>
          </div>
          <div
            className="w-14 md:w-16 shrink-0 text-right cursor-pointer hover:text-slate-800 select-none"
            onClick={() => handleSort('growth')}
          >
            Growth<SortIcon column="growth" />
          </div>
        </div>
      </div>

      {/* Dumbbell Rows */}
      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
        {sortedData.map((item) => {
          const startPercent = psfToPercent(item.startPsf);
          const endPercent = psfToPercent(item.endPsf);
          const leftPercent = Math.min(startPercent, endPercent);
          const rightPercent = Math.max(startPercent, endPercent);

          // Clean state-based styling
          const endDotColor = getEndDotColor(item.growthPercent);
          const lineColor = getLineColor(item.growthPercent);
          const lineThickness = getLineThickness(item.growthPercent);
          const endDotSize = getEndDotSize(item.growthPercent);

          const regionBg = REGION_HEADER_BG[item.region] || REGION_HEADER_BG.OCR;
          const regionText = REGION_HEADER_TEXT[item.region] || REGION_HEADER_TEXT.OCR;

          // Text color matches end dot state
          const textColorClass = item.growthPercent >= 30 ? 'text-emerald-700'
            : item.growthPercent >= 10 ? 'text-emerald-600'
            : item.growthPercent <= -20 ? 'text-red-600'
            : item.growthPercent <= -5 ? 'text-red-400'
            : 'text-slate-500';

          return (
            <div
              key={item.district}
              className="px-3 md:px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors group"
              onClick={() => handleDistrictClick(item.district)}
              title={`${DISTRICT_NAMES[item.district]}\n${item.startQuarter}: ${formatPrice(item.startPsf)} → ${item.endQuarter}: ${formatPrice(item.endPsf)}`}
            >
              <div className="flex items-center">
                {/* Combined District + Area column - responsive */}
                <div className="w-12 md:w-56 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] md:text-xs font-bold px-1 md:px-1.5 py-0.5 rounded shrink-0 ${regionBg} ${regionText}`}>
                      {item.district}
                    </span>
                    {/* Area names - hidden on mobile */}
                    <span className="hidden md:block text-sm text-slate-600 truncate" title={DISTRICT_NAMES[item.district]}>
                      {item.areaNames}
                    </span>
                  </div>
                </div>

                {/* Dumbbell Chart Area */}
                <div className="flex-1 relative h-7 mx-1 md:mx-0">
                  {/* Background track */}
                  <div className="absolute inset-y-2.5 left-0 right-0 bg-slate-100 rounded-full" />

                  {/* Connecting line - thickness varies by growth magnitude */}
                  <div
                    className="absolute rounded-full transition-all"
                    style={{
                      left: `${leftPercent}%`,
                      width: `${Math.max(rightPercent - leftPercent, 1)}%`,
                      height: `${lineThickness}px`,
                      top: `calc(50% - ${lineThickness / 2}px)`,
                      backgroundColor: lineColor,
                    }}
                  />

                  {/* Start dot - always neutral grey (the past) */}
                  <div
                    className="absolute rounded-full bg-slate-300 border-2 border-white shadow-sm transform -translate-x-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform"
                    style={{
                      left: `${startPercent}%`,
                      top: '50%',
                      width: '12px',
                      height: '12px',
                    }}
                  />

                  {/* End dot - colored by outcome, size varies */}
                  <div
                    className="absolute rounded-full border-2 border-white shadow-md transform -translate-x-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform z-10"
                    style={{
                      left: `${endPercent}%`,
                      top: '50%',
                      width: `${Math.max(endDotSize - 2, 14)}px`,
                      height: `${Math.max(endDotSize - 2, 14)}px`,
                      backgroundColor: endDotColor,
                    }}
                  />
                </div>

                {/* Growth Percentage */}
                <div className="w-14 md:w-16 shrink-0 text-right">
                  <span className={`text-xs md:text-sm font-bold ${textColorClass}`}>
                    {item.growthPercent >= 0 ? '+' : ''}{item.growthPercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with explanatory notes */}
      <div className="px-4 py-3 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30">
        <div className="flex flex-col gap-2">
          {/* Data indicator */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
            <span className="text-[#547792] font-medium">
              Data: {isSaleType.resale(saleType) ? 'Resale Only' : isSaleType.newSale(saleType) ? 'New Sale Only' : 'All Transactions (New Sale + Resale)'}
            </span>
            <span className="text-[#94B4C1]">{chartData.length} districts</span>
          </div>

          {/* Visual legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#547792]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-white"></span>
              <span>Start ({startQuarter})</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white"></span>
              <span>Growth</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400 border border-white"></span>
              <span>Neutral</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-400 border border-white"></span>
              <span>Decline</span>
            </span>
          </div>

          {/* Additional notes */}
          <div className="text-[10px] text-[#94B4C1]">
            <p>Larger dot & thicker line = stronger price movement. Click headers to sort. Click district to filter.</p>
          </div>
        </div>
      </div>
    </div>
    </QueryState>
  );
}

export default GrowthDumbbellChart;
