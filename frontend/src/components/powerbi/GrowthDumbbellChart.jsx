import React, { useState, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import { getAggregate } from '../../api/client';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS, DISTRICT_NAMES, getRegionForDistrict } from '../../constants';
import { isSaleType } from '../../schemas/apiContract';
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
          style={{ gridTemplateColumns: 'minmax(100px, 160px) 1fr 60px 60px 55px 50px' }}
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
            onClick={() => handleSort('startPsf')}
            title="Baseline Quarter PSF"
          >
            Base<SortIcon column="startPsf" />
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
          // Left-aligned dumbbell: baseline at 0%, latest position based on growth
          // Scale: 0% growth = 10%, 100% growth = 100%
          const growthClamped = Math.max(0, Math.min(item.growthPercent, 100));
          const latestDotPosition = 10 + (growthClamped / 100) * 90; // 10% to 100%

          // Clean state-based styling
          const endDotColor = getEndDotColor(item.growthPercent);
          const lineColor = getLineColor(item.growthPercent);

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
              className="px-3 md:px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors group"
              onClick={() => handleDistrictClick(item.district)}
              title={`${DISTRICT_NAMES[item.district]}\nBaseline: ${formatPrice(item.startPsf)} → Latest: ${formatPrice(item.endPsf)}`}
            >
              {/* CSS Grid row - matches header */}
              <div
                className="grid items-center gap-x-3"
                style={{ gridTemplateColumns: 'minmax(100px, 160px) 1fr 60px 60px 55px 50px' }}
              >
                {/* Column 1: District */}
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${regionBg} ${regionText}`}>
                    {item.district}
                  </span>
                  <span className="text-xs text-slate-600 truncate" title={DISTRICT_NAMES[item.district]}>
                    {item.areaNames}
                  </span>
                </div>

                {/* Column 2: Dumbbell (left-aligned, baseline at left) */}
                <div className="relative h-5">
                  {/* Background track */}
                  <div className="absolute left-0 right-0 bg-slate-100 rounded-full" style={{ top: '50%', height: '2px', transform: 'translateY(-50%)' }} />

                  {/* Connecting line from baseline to latest */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: '0',
                      width: `${latestDotPosition}%`,
                      height: '3px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: lineColor,
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

                  {/* Latest dot (position based on growth) */}
                  <div
                    className="absolute rounded-full border-2 border-white shadow-md z-10"
                    style={{
                      left: `${latestDotPosition}%`,
                      top: '50%',
                      width: '10px',
                      height: '10px',
                      transform: 'translate(-50%, -50%)',
                      backgroundColor: endDotColor,
                    }}
                  />
                </div>

                {/* Column 3: Baseline PSF */}
                <div className="text-right">
                  <span className="text-xs text-slate-500">
                    {formatPrice(item.startPsf)}
                  </span>
                </div>

                {/* Column 4: Latest PSF */}
                <div className="text-right">
                  <span className="text-xs font-medium text-slate-700">
                    {formatPrice(item.endPsf)}
                  </span>
                </div>

                {/* Column 5: Δ PSF (Increment) */}
                <div className="text-right">
                  <span className={`text-xs font-medium ${item.growthPercent >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {item.growthPercent >= 0 ? '+' : ''}{formatPrice(item.endPsf - item.startPsf)}
                  </span>
                </div>

                {/* Column 6: Growth % */}
                <div className="text-right">
                  <span className={`text-xs font-bold ${textColorClass}`}>
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
    </QueryState>
  );
}

export default GrowthDumbbellChart;
