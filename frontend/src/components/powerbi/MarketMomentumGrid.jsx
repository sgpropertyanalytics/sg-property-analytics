import React, { useState, useEffect, useMemo } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS } from '../../constants';
import { DistrictMicroChart } from './DistrictMicroChart';

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
  const { buildApiParams, applyCrossFilter, filters } = usePowerBIFilters();
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch data for all districts
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Single API call for all districts, grouped by quarter
        // Uses excludeHighlight: true because this is a time-series visualization
        const params = buildApiParams({
          group_by: 'quarter,district',
          metrics: 'median_psf,total_value',
        }, { excludeHighlight: true });

        const response = await getAggregate(params);
        const rawData = response.data?.data || [];

        // Group by district, preserving quarter order
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
              totalValue: row.total_value || 0,
            });
          }
        });

        // Sort each district's data by quarter
        Object.values(districtData).forEach(arr => {
          arr.sort((a, b) => (a.quarter || '').localeCompare(b.quarter || ''));
        });

        setData(districtData);
      } catch (err) {
        console.error('Error fetching market momentum data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [buildApiParams, filters]);

  // Handle district click - apply cross-filter
  const handleDistrictClick = (district) => {
    applyCrossFilter('location', 'district', district);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-5 w-48 bg-[#EAE0CF]/50 rounded animate-pulse" />
              <div className="h-3 w-64 bg-[#EAE0CF]/30 rounded mt-1 animate-pulse" />
            </div>
            <div className="h-4 w-40 bg-[#EAE0CF]/30 rounded animate-pulse" />
          </div>
        </div>

        {/* Grid skeleton */}
        <div className="p-4">
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
          <p className="text-xs text-[#94B4C1] mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div>
          <h3 className="text-sm font-semibold text-[#213448]">Market Momentum Grid</h3>
          <p className="text-xs text-[#547792] mt-0.5">
            Historical price growth by district (quarterly) • Click to filter
          </p>
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

      {/* Footer with data info */}
      <div className="px-4 py-2 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] text-[#94B4C1]">
            <span>
              <span className="text-emerald-700">■</span> Strong uptrend •
              <span className="text-emerald-600"> ■</span> Uptrend •
              <span className="text-gray-700"> ■</span> Neutral •
              <span className="text-red-600"> ■</span> Downtrend
            </span>
            <span>{ALL_DISTRICTS.length} districts • Independent Y-axes</span>
          </div>
          <div className="text-[10px] text-[#94B4C1] italic">
            Note: D24 (Lim Chu Kang / Tengah) has no condo transactions — area is largely undeveloped with Tengah town still under construction.
          </div>
        </div>
      </div>
    </div>
  );
}

export default MarketMomentumGrid;
