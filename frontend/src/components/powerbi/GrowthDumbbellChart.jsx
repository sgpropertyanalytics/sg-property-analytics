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
 * It compares the earliest 3 completed months (baseline quarter) against
 * the latest 3 completed months (current quarter) across the FULL database.
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
      // Build API params - NO date filters, uses full database range
      const params = {
        group_by: 'quarter,district',
        metrics: 'median_psf',
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
    { initialData: { chartData: [], startQuarter: '', endQuarter: '', excludedDistricts: [] } }
  );

  // Extract transformed data and add display metadata
  const { chartData: baseChartData, startQuarter, endQuarter, excludedDistricts = [] } = data;

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
          className="grid items-center gap-x-3 text-xs font-medium text-slate-600"
          style={{ gridTemplateColumns: 'minmax(100px, 180px) 1fr 65px 65px 55px' }}
        >
          <div
            className="cursor-pointer hover:text-slate-800 select-none truncate"
            onClick={() => handleSort('district')}
          >
            District<SortIcon column="district" />
          </div>
          <div className="text-center text-slate-400 text-[10px]">
            {startQuarter} → {endQuarter}
          </div>
          <div
            className="text-right cursor-pointer hover:text-slate-800 select-none"
            onClick={() => handleSort('endPsf')}
            title="Latest Quarter PSF"
          >
            Latest<SortIcon column="endPsf" />
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
            %<SortIcon column="growth" />
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
              {/* CSS Grid row - matches header */}
              <div
                className="grid items-center gap-x-4"
                style={{ gridTemplateColumns: 'minmax(120px, 200px) 1fr 70px 60px' }}
              >
                {/* Column 1: District label (fixed width, never clips) */}
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] md:text-xs font-bold px-1 md:px-1.5 py-0.5 rounded shrink-0 ${regionBg} ${regionText}`}>
                      {item.district}
                    </span>
                    <span className="text-xs md:text-sm text-slate-600 truncate" title={DISTRICT_NAMES[item.district]}>
                      {item.areaNames}
                    </span>
                  </div>
                </div>

                {/* Column 2: Dumbbell chart with fixed label areas */}
                <div className="flex items-center h-10 gap-2">
                  {/* Start PSF label - fixed width */}
                  <span className="text-[9px] md:text-[10px] text-slate-500 w-12 md:w-14 text-right shrink-0">
                    {formatPrice(item.startPsf)}
                  </span>

                  {/* Track area - flexes */}
                  <div className="flex-1 relative h-full">
                    {/* Background track */}
                    <div className="absolute left-0 right-0 bg-slate-100 rounded-full" style={{ top: '50%', height: '4px', transform: 'translateY(-50%)' }} />

                    {/* Connecting line */}
                    <div
                      className="absolute rounded-full transition-all"
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(rightPercent - leftPercent, 1)}%`,
                        height: `${lineThickness}px`,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        backgroundColor: lineColor,
                      }}
                    />

                    {/* Start dot */}
                    <div
                      className="absolute rounded-full bg-slate-300 border-2 border-white shadow-sm group-hover:scale-110 transition-transform"
                      style={{
                        left: `${startPercent}%`,
                        top: '50%',
                        width: '12px',
                        height: '12px',
                        transform: 'translate(-50%, -50%)',
                      }}
                    />

                    {/* End dot */}
                    <div
                      className="absolute rounded-full border-2 border-white shadow-md group-hover:scale-110 transition-transform z-10"
                      style={{
                        left: `${endPercent}%`,
                        top: '50%',
                        width: `${Math.max(endDotSize - 2, 14)}px`,
                        height: `${Math.max(endDotSize - 2, 14)}px`,
                        transform: 'translate(-50%, -50%)',
                        backgroundColor: endDotColor,
                      }}
                    />
                  </div>

                  {/* End PSF label - fixed width */}
                  <span className={`text-[9px] md:text-[10px] font-medium w-12 md:w-14 shrink-0 ${textColorClass}`}>
                    {formatPrice(item.endPsf)}
                  </span>
                </div>

                {/* Column 3: Increment */}
                <div className="text-right">
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

                {/* Column 4: Growth % */}
                <div className="text-right">
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
            <span className="text-[#94B4C1]">• Full database range (not affected by date filters)</span>
          </div>

          {/* Visual legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#547792]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-white"></span>
              <span>Earliest Quarter ({startQuarter})</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white"></span>
              <span>Latest Quarter ({endQuarter}) - Growth</span>
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

          {/* Excluded districts note */}
          {excludedDistricts.length > 0 && (
            <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1.5 rounded border border-amber-200">
              <span className="font-medium">Excluded ({excludedDistricts.length}):</span>{' '}
              {excludedDistricts.map((item, idx) => (
                <span key={item.district}>
                  {item.district} ({item.reason}){idx < excludedDistricts.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </QueryState>
  );
}

export default GrowthDumbbellChart;
