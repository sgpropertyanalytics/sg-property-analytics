import React from 'react';
import { useAbortableQuery } from '../../hooks';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS } from '../../constants';
import { DistrictMicroChart } from './DistrictMicroChart';
import { isSaleType, getAggField, AggField } from '../../schemas/apiContract';

// All districts ordered by region: CCR → RCR → OCR
const ALL_DISTRICTS = [...CCR_DISTRICTS, ...RCR_DISTRICTS, ...OCR_DISTRICTS];

/**
 * MarketMomentumGrid - 28-District Price Growth Visualization
 *
 * Displays a grid of micro-charts showing historical price growth for all districts.
 * Each chart shows:
 * - Median PSF trend (line, region-colored)
 * - Total transaction value (background bars)
 *
 * Layout:
 * - Desktop (lg+): 7 columns × 4 rows
 * - Tablet (md): 4 columns × 7 rows
 * - Mobile: 2 columns × 14 rows
 */
export function MarketMomentumGrid() {
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey, applyCrossFilter, filters } = usePowerBIFilters();

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Single API call for all districts, grouped by quarter
      // Uses excludeHighlight: true because this is a time-series visualization
      const params = buildApiParams({
        group_by: 'quarter,district',
        metrics: 'median_psf,total_value',
      }, { excludeHighlight: true });

      const response = await getAggregate(params, { signal });
      const rawData = response.data?.data || [];

      // Group by district, preserving quarter order
      const districtData = {};
      ALL_DISTRICTS.forEach(d => {
        districtData[d] = [];
      });

      rawData.forEach(row => {
        const district = row.district;
        if (district && districtData[district]) {
          // Use getAggField for v1/v2 compatibility
          const medianPsf = getAggField(row, AggField.MEDIAN_PSF) || getAggField(row, AggField.AVG_PSF) || 0;
          const totalValue = getAggField(row, AggField.TOTAL_VALUE) || 0;
          districtData[district].push({
            quarter: row.quarter,
            medianPsf,
            totalValue,
          });
        }
      });

      // Sort each district's data by quarter
      Object.values(districtData).forEach(arr => {
        arr.sort((a, b) => (a.quarter || '').localeCompare(b.quarter || ''));
      });

      return districtData;
    },
    [debouncedFilterKey],
    { initialData: {} }
  );

  // Handle district click - apply cross-filter
  const handleDistrictClick = (district) => {
    applyCrossFilter('location', 'district', district);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
        {/* Header */}
        <div className="px-3 md:px-4 py-3 border-b border-[#94B4C1]/30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="h-5 w-32 md:w-48 bg-[#EAE0CF]/50 rounded animate-pulse" />
              <div className="h-3 w-48 md:w-64 bg-[#EAE0CF]/30 rounded mt-1 animate-pulse" />
            </div>
            <div className="h-4 w-28 md:w-40 bg-[#EAE0CF]/30 rounded animate-pulse" />
          </div>
        </div>

        {/* Grid skeleton */}
        <div className="p-3 lg:p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 lg:gap-3">
            {ALL_DISTRICTS.map((district) => (
              <div
                key={district}
                className="aspect-[4/3] bg-[#EAE0CF]/20 rounded border border-[#94B4C1]/30 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#94B4C1]/30">
          <h3 className="text-sm font-semibold text-[#213448]">Market Momentum Grid</h3>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm text-[#547792]">Unable to load market data</p>
          <p className="text-xs text-[#94B4C1] mt-1">{error?.message || error}</p>
          <button
            onClick={refetch}
            className="mt-3 px-3 py-1.5 text-xs bg-[#547792] text-white rounded hover:bg-[#213448] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-3 md:px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#213448]">Median PSF Trend by District</h3>
            <p className="text-xs text-[#547792] mt-0.5">
              <span className="hidden sm:inline">% shows total growth from first to last quarter • Click to filter</span>
              <span className="sm:hidden">% = growth • Tap to filter</span>
            </p>
          </div>
          {/* Region Legend */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 sm:w-4 sm:h-3 rounded bg-[#213448]" />
              <span className="text-[#547792]">CCR</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 sm:w-4 sm:h-3 rounded bg-[#547792]" />
              <span className="text-[#547792]">RCR</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 sm:w-4 sm:h-3 rounded bg-[#94B4C1]" />
              <span className="text-[#547792]">OCR</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of micro-charts */}
      <div className="p-3 lg:p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 lg:gap-3">
          {ALL_DISTRICTS.map((district) => (
            <div key={district} className="aspect-[4/3]">
              <DistrictMicroChart
                district={district}
                data={data[district] || []}
                onClick={handleDistrictClick}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Footer with explanatory notes */}
      <div className="px-3 md:px-4 py-2 md:py-3 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30">
        <div className="flex flex-col gap-1.5 md:gap-2">
          {/* Data indicator */}
          <div className="flex flex-wrap items-center gap-x-3 md:gap-x-4 gap-y-1 text-[10px]">
            <span className="text-[#547792] font-medium">
              {isSaleType.resale(filters.saleType) ? 'Resale Only' : isSaleType.newSale(filters.saleType) ? 'New Sale Only' : 'All Sale Types'}
            </span>
            <span className="text-[#94B4C1]">{ALL_DISTRICTS.length} districts</span>
          </div>

          {/* Chart legend - simplified on mobile */}
          <div className="flex flex-wrap items-center gap-x-3 md:gap-x-4 gap-y-1 text-[10px] text-[#547792]">
            <span><strong>Line:</strong> Median PSF</span>
            <span><strong>Bars:</strong> Volume ($)</span>
            <span className="hidden sm:inline"><strong>%:</strong> Total growth</span>
          </div>

          {/* Additional notes - hidden on mobile */}
          <div className="hidden sm:block text-[10px] text-[#94B4C1] space-y-0.5">
            <p>Each chart has independent Y-axis scaling. Use sidebar filters to change date range or sale type.</p>
            <p className="italic">Note: D24 (Lim Chu Kang / Tengah) has no condo transactions.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MarketMomentumGrid;
