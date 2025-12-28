import React, { useState, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import { getAggregate } from '../../api/client';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS, DISTRICT_NAMES, getRegionForDistrict } from '../../constants';
import { isSaleType } from '../../schemas/apiContract';
import { transformGrowthDumbbellSeries, logFetchDebug, assertKnownVersion } from '../../adapters';
import { nicePsfMin, nicePsfMax } from '../../utils/niceAxisMax';

// All districts
const ALL_DISTRICTS = [...CCR_DISTRICTS, ...RCR_DISTRICTS, ...OCR_DISTRICTS];

/**
 * Calculate fixed date range for last 3 completed months.
 * This chart is NOT affected by date filters - always uses fixed baseline comparison.
 *
 * @returns {Object} { dateFrom, dateTo } for API params
 */
function getFixedDateRange() {
  const today = new Date();

  // Get first day of current month (incomplete month - exclude)
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Latest quarter = last 3 completed months (e.g., if Dec 2024, use Sep-Nov)
  // We need enough historical data for comparison, so fetch 2 years
  const twoYearsAgo = new Date(currentMonthStart);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  return {
    dateFrom: twoYearsAgo.toISOString().split('T')[0],
    dateTo: currentMonthStart.toISOString().split('T')[0], // Exclusive upper bound
  };
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
 * GrowthDumbbellChart - Dumbbell chart of Median PSF Growth %
 *
 * A dumbbell/gap chart showing baseline vs latest quarter median PSF for each district,
 * with sortable columns and absolute PSF increment.
 *
 * IMPORTANT: This chart is NOT affected by date filters.
 * It always compares the last 3 completed months (latest quarter) against
 * the baseline quarter from 1 year prior.
 *
 * @param {string} bedroom - 'all', '1', '2', '3', '4', '5' (still respects bedroom filter)
 * @param {string} saleType - 'all', 'New Sale', 'Resale' (still respects sale type filter)
 */
export function GrowthDumbbellChart({ bedroom = 'all', saleType = 'all' }) {
  // Create a stable filter key for dependency tracking (no period - fixed date range)
  const filterKey = useMemo(() => `fixed:${bedroom}:${saleType}`, [bedroom, saleType]);
  const [sortConfig, setSortConfig] = useState({ column: 'growth', order: 'desc' });

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Get fixed date range (NOT affected by date filters)
      const { dateFrom, dateTo } = getFixedDateRange();

      // Build API params
      const params = {
        group_by: 'quarter,district',
        metrics: 'median_psf',
        date_from: dateFrom,
        date_to: dateTo,
      };

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

  // Calculate scale for the chart with nice boundaries (INV-11)
  const { minPsf, maxPsf } = useMemo(() => {
    if (chartData.length === 0) return { minPsf: 0, maxPsf: 3000 };

    const allPsf = chartData.flatMap(d => [d.startPsf, d.endPsf]);
    const min = Math.min(...allPsf);
    const max = Math.max(...allPsf);

    return {
      minPsf: nicePsfMin(min),
      maxPsf: nicePsfMax(max),
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
      {/* Header with title */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#213448]">
              Dumbbell Chart of Median PSF Growth %
            </h3>
            <p className="text-xs text-[#547792] mt-0.5">
              Comparing {startQuarter} (baseline) → {endQuarter} (latest) • Click headers to sort
            </p>
          </div>
          {/* Dot Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-slate-300 border border-white shadow-sm" />
              <span className="text-[#547792]">Baseline Quarter</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 border border-white shadow-sm" />
              <span className="text-[#547792]">Latest Quarter</span>
            </div>
          </div>
        </div>
      </div>

      {/* Column Headers - Sortable (matching other table styling) */}
      <div className="px-3 md:px-4 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center text-xs font-medium text-slate-600">
          <div
            className="w-12 md:w-48 shrink-0 cursor-pointer hover:text-slate-800 select-none"
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
              title="Baseline Quarter Median PSF"
            >
              <span className="hidden lg:inline">Baseline </span>{startQuarter}<SortIcon column="startPsf" />
            </span>
            <span className="text-slate-500 hidden sm:inline">Median PSF</span>
            <span
              className="cursor-pointer hover:text-slate-800 select-none text-[10px] md:text-xs"
              onClick={() => handleSort('endPsf')}
              title="Latest Quarter Median PSF"
            >
              <span className="hidden lg:inline">Latest </span>{endQuarter}<SortIcon column="endPsf" />
            </span>
          </div>
          <div
            className="w-16 md:w-20 shrink-0 text-right cursor-pointer hover:text-slate-800 select-none"
            onClick={() => handleSort('increment')}
            title="Absolute PSF change"
          >
            <span className="hidden md:inline">Increment</span>
            <span className="md:hidden">+/-</span>
            <SortIcon column="increment" />
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
                <div className="w-12 md:w-48 shrink-0">
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

                  {/* Start dot - Baseline Quarter (neutral grey) */}
                  <div
                    className="absolute rounded-full bg-slate-300 border-2 border-white shadow-sm transform -translate-x-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform"
                    style={{
                      left: `${startPercent}%`,
                      top: '50%',
                      width: '12px',
                      height: '12px',
                    }}
                    title={`Baseline Quarter Median PSF: ${formatPrice(item.startPsf)}`}
                  />

                  {/* End dot - Latest Quarter (colored by outcome) */}
                  <div
                    className="absolute rounded-full border-2 border-white shadow-md transform -translate-x-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform z-10"
                    style={{
                      left: `${endPercent}%`,
                      top: '50%',
                      width: `${Math.max(endDotSize - 2, 14)}px`,
                      height: `${Math.max(endDotSize - 2, 14)}px`,
                      backgroundColor: endDotColor,
                    }}
                    title={`Latest Quarter Median PSF: ${formatPrice(item.endPsf)}`}
                  />
                </div>

                {/* Absolute PSF Increment */}
                <div className="w-16 md:w-20 shrink-0 text-right">
                  {(() => {
                    const increment = item.endPsf - item.startPsf;
                    const incrementClass = increment >= 0 ? 'text-emerald-600' : 'text-red-500';
                    return (
                      <span className={`text-xs md:text-sm font-medium ${incrementClass}`}>
                        {increment >= 0 ? '+' : ''}{formatPrice(increment)}
                      </span>
                    );
                  })()}
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
            <span className="text-[#94B4C1]">• Fixed date range (not affected by filters)</span>
          </div>

          {/* Visual legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#547792]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-white"></span>
              <span>Baseline Quarter Median PSF ({startQuarter})</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white"></span>
              <span>Latest Quarter Median PSF ({endQuarter}) - Growth</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-400 border border-white"></span>
              <span>Decline</span>
            </span>
          </div>

          {/* Additional notes */}
          <div className="text-[10px] text-[#94B4C1]">
            <p>Increment = absolute PSF change. Larger dot & thicker line = stronger movement. Click headers to sort.</p>
          </div>
        </div>
      </div>
    </div>
    </QueryState>
  );
}

export default GrowthDumbbellChart;
