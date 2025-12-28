import React, { useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { getAggregate } from '../../api/client';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS } from '../../constants';
import { DistrictMicroChart } from './DistrictMicroChart';
import { isSaleType, getAggField, AggField } from '../../schemas/apiContract';
import { assertKnownVersion } from '../../adapters';
import { ChartSkeleton } from '../common/ChartSkeleton';

// All districts ordered by region: CCR → RCR → OCR
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

/**
 * MarketMomentumGrid - 28-District Price Growth Visualization
 *
 * Displays a grid of micro-charts showing historical price growth for all districts.
 * Each chart shows:
 * - Median PSF trend (line, region-colored)
 * - Total transaction value (background bars)
 *
 * IMPORTANT: This component does NOT use PowerBIFilterContext.
 * It receives filters as props from the parent component (DistrictDeepDive).
 * This is intentional - PowerBIFilterContext only affects Market Pulse page.
 *
 * @param {string} period - '3m', '6m', '12m', or 'all'
 * @param {string} bedroom - 'all', '1', '2', '3', '4', '5'
 * @param {string} saleType - 'all', 'New Sale', 'Resale'
 */
export function MarketMomentumGrid({ period = '12m', bedroom = 'all', saleType = 'all' }) {
  // Create a stable filter key for dependency tracking
  const filterKey = useMemo(() => `${period}:${bedroom}:${saleType}`, [period, bedroom, saleType]);

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Build API params from props (not PowerBIFilterContext)
      const params = {
        group_by: 'quarter,district',
        metrics: 'median_psf,total_value',
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
    [filterKey],
    { initialData: {} }
  );

  // Handle district click - no cross-filter since we're not using PowerBIFilterContext
  // This is a visual-only interaction for now (could add onClick prop in future)
  const handleDistrictClick = (_district) => {
    // No-op: District clicks don't cross-filter in District Deep Dive
    // The heatmap controls the filters, not individual chart interactions
  };

  // Loading skeleton
  if (loading) {
    return <ChartSkeleton type="grid" height={400} />;
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
              {isSaleType.resale(saleType) ? 'Resale Only' : isSaleType.newSale(saleType) ? 'New Sale Only' : 'All Sale Types'}
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
