import React, { useState, useEffect, useMemo } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS, DISTRICT_NAMES, getRegionForDistrict } from '../../constants';

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

// Trend-based colors
const getTrendColor = (growthPercent) => {
  if (growthPercent >= 30) return '#166534';   // Dark green
  if (growthPercent >= 10) return '#16a34a';   // Green
  if (growthPercent <= -20) return '#991b1b';  // Dark red
  if (growthPercent <= -5) return '#dc2626';   // Red
  return '#1f2937';  // Neutral/black
};

const getTrendBarColor = (growthPercent) => {
  if (growthPercent >= 30) return 'rgba(22, 101, 52, 0.3)';
  if (growthPercent >= 10) return 'rgba(22, 163, 74, 0.3)';
  if (growthPercent <= -20) return 'rgba(153, 27, 27, 0.3)';
  if (growthPercent <= -5) return 'rgba(220, 38, 38, 0.3)';
  return 'rgba(31, 41, 55, 0.2)';
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
 */
export function GrowthDumbbellChart() {
  const { buildApiParams, applyCrossFilter, filters } = usePowerBIFilters();
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ column: 'growth', order: 'desc' });

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = buildApiParams({
          group_by: 'quarter,district',
          metrics: 'median_psf',
        }, { excludeHighlight: true });

        const response = await getAggregate(params);
        setRawData(response.data?.data || []);
      } catch (err) {
        console.error('Error fetching dumbbell chart data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [buildApiParams, filters]);

  // Process data: calculate start, end, and growth for each district
  const { chartData, startQuarter, endQuarter } = useMemo(() => {
    if (!rawData || rawData.length === 0) return { chartData: [], startQuarter: '', endQuarter: '' };

    // Group by district
    const districtData = {};
    ALL_DISTRICTS.forEach(d => {
      districtData[d] = [];
    });

    rawData.forEach(row => {
      const district = row.district;
      if (district && districtData[district]) {
        districtData[district].push({
          quarter: row.quarter,
          medianPsf: row.median_psf || row.avg_psf || 0,
        });
      }
    });

    // Calculate start, end, growth for each district
    const results = [];
    let globalStartQuarter = '';
    let globalEndQuarter = '';

    Object.entries(districtData).forEach(([district, data]) => {
      if (data.length === 0) return;

      // Sort by quarter
      data.sort((a, b) => (a.quarter || '').localeCompare(b.quarter || ''));

      // Get first and last valid PSF
      const validData = data.filter(d => d.medianPsf > 0);
      if (validData.length < 2) return;

      const first = validData[0];
      const last = validData[validData.length - 1];
      const growthPercent = ((last.medianPsf - first.medianPsf) / first.medianPsf) * 100;

      // Track global quarters
      if (!globalStartQuarter || first.quarter < globalStartQuarter) {
        globalStartQuarter = first.quarter;
      }
      if (!globalEndQuarter || last.quarter > globalEndQuarter) {
        globalEndQuarter = last.quarter;
      }

      results.push({
        district,
        region: getRegionForDistrict(district),
        areaNames: getAreaNames(district),
        startPsf: first.medianPsf,
        endPsf: last.medianPsf,
        startQuarter: first.quarter,
        endQuarter: last.quarter,
        growthPercent,
      });
    });

    return { chartData: results, startQuarter: globalStartQuarter, endQuarter: globalEndQuarter };
  }, [rawData]);

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

  // Sort icon component
  const SortIcon = ({ column }) => {
    const isActive = sortConfig.column === column;
    return (
      <span className={`ml-1 ${isActive ? 'text-[#213448]' : 'text-[#94B4C1]'}`}>
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

  // Handle district click
  const handleDistrictClick = (district) => {
    applyCrossFilter('location', 'district', district);
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#94B4C1]/30">
          <div className="h-5 w-64 bg-[#EAE0CF]/50 rounded animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-8 bg-[#EAE0CF]/20 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#94B4C1]/30">
          <h3 className="text-sm font-semibold text-[#213448]">Median PSF Growth</h3>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm text-[#547792]">Unable to load data</p>
        </div>
      </div>
    );
  }

  return (
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

      {/* Column Headers - Sortable */}
      <div className="px-4 py-2 bg-[#EAE0CF]/10 border-b border-[#94B4C1]/20">
        <div className="flex items-center text-[10px] text-[#547792] font-medium">
          <div
            className="w-14 shrink-0 cursor-pointer hover:text-[#213448] select-none"
            onClick={() => handleSort('district')}
          >
            District<SortIcon column="district" />
          </div>
          <div
            className="w-36 shrink-0 cursor-pointer hover:text-[#213448] select-none hidden md:block"
            onClick={() => handleSort('area')}
          >
            Area<SortIcon column="area" />
          </div>
          <div className="flex-1 flex justify-between px-2">
            <span
              className="cursor-pointer hover:text-[#213448] select-none"
              onClick={() => handleSort('startPsf')}
            >
              {startQuarter}<SortIcon column="startPsf" />
            </span>
            <span className="text-[#94B4C1]">Median PSF</span>
            <span
              className="cursor-pointer hover:text-[#213448] select-none"
              onClick={() => handleSort('endPsf')}
            >
              {endQuarter}<SortIcon column="endPsf" />
            </span>
          </div>
          <div
            className="w-16 shrink-0 text-right cursor-pointer hover:text-[#213448] select-none"
            onClick={() => handleSort('growth')}
          >
            Growth<SortIcon column="growth" />
          </div>
        </div>
      </div>

      {/* Dumbbell Rows */}
      <div className="divide-y divide-[#94B4C1]/20 max-h-[500px] overflow-y-auto">
        {sortedData.map((item) => {
          const startPercent = psfToPercent(item.startPsf);
          const endPercent = psfToPercent(item.endPsf);
          const leftPercent = Math.min(startPercent, endPercent);
          const rightPercent = Math.max(startPercent, endPercent);
          const trendColor = getTrendColor(item.growthPercent);
          const trendBarColor = getTrendBarColor(item.growthPercent);
          const regionBg = REGION_HEADER_BG[item.region] || REGION_HEADER_BG.OCR;
          const regionText = REGION_HEADER_TEXT[item.region] || REGION_HEADER_TEXT.OCR;

          // Text color class based on trend
          const textColorClass = item.growthPercent >= 30 ? 'text-emerald-800'
            : item.growthPercent >= 10 ? 'text-emerald-600'
            : item.growthPercent <= -20 ? 'text-red-800'
            : item.growthPercent <= -5 ? 'text-red-500'
            : 'text-gray-700';

          return (
            <div
              key={item.district}
              className="px-4 py-2 hover:bg-[#EAE0CF]/20 cursor-pointer transition-colors group"
              onClick={() => handleDistrictClick(item.district)}
              title={`${DISTRICT_NAMES[item.district]}\n${item.startQuarter}: ${formatPrice(item.startPsf)} → ${item.endQuarter}: ${formatPrice(item.endPsf)}`}
            >
              <div className="flex items-center">
                {/* District Label with region badge */}
                <div className="w-14 shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${regionBg} ${regionText}`}>
                    {item.district}
                  </span>
                </div>

                {/* Area Names - hidden on mobile */}
                <div className="w-36 shrink-0 hidden md:block">
                  <span className="text-[10px] text-[#547792] truncate block" title={DISTRICT_NAMES[item.district]}>
                    {item.areaNames}
                  </span>
                </div>

                {/* Dumbbell Chart Area */}
                <div className="flex-1 relative h-6">
                  {/* Background track */}
                  <div className="absolute inset-y-2 left-0 right-0 bg-[#EAE0CF]/30 rounded-full" />

                  {/* Connecting bar */}
                  <div
                    className="absolute top-2.5 h-1 rounded-full transition-all"
                    style={{
                      left: `${leftPercent}%`,
                      width: `${rightPercent - leftPercent}%`,
                      backgroundColor: trendBarColor,
                    }}
                  />

                  {/* Start dot (grey) */}
                  <div
                    className="absolute top-1 w-4 h-4 rounded-full bg-[#94B4C1] border-2 border-white shadow-sm transform -translate-x-1/2 group-hover:scale-110 transition-transform"
                    style={{ left: `${startPercent}%` }}
                  />

                  {/* End dot (trend-colored) */}
                  <div
                    className="absolute top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm transform -translate-x-1/2 group-hover:scale-110 transition-transform z-10"
                    style={{
                      left: `${endPercent}%`,
                      backgroundColor: trendColor,
                    }}
                  />
                </div>

                {/* Growth Percentage */}
                <div className="w-16 shrink-0 text-right">
                  <span className={`text-xs font-bold ${textColorClass}`}>
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
              Data: {filters.saleType === 'Resale' ? 'Resale Only' : filters.saleType === 'New Sale' ? 'New Sale Only' : 'All Transactions (New Sale + Resale)'}
            </span>
            <span className="text-[#94B4C1]">{chartData.length} districts</span>
          </div>

          {/* Chart legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#547792]">
            <span><strong>Grey dot:</strong> {startQuarter} Median PSF</span>
            <span><strong>Colored dot:</strong> {endQuarter} Median PSF</span>
            <span><strong>%:</strong> Total price change between quarters</span>
          </div>

          {/* Additional notes */}
          <div className="text-[10px] text-[#94B4C1]">
            <p>Green = price increase, Red = price decrease. Click column headers to sort. Click district to filter dashboard.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GrowthDumbbellChart;
