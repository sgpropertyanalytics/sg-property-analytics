import React, { useState, useEffect, useMemo } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS, DISTRICT_NAMES, getRegionForDistrict } from '../../constants';

// All districts
const ALL_DISTRICTS = [...CCR_DISTRICTS, ...RCR_DISTRICTS, ...OCR_DISTRICTS];

// Region colors matching project palette
const REGION_COLORS = {
  CCR: '#213448', // Deep Navy
  RCR: '#547792', // Ocean Blue
  OCR: '#94B4C1', // Sky Blue
};

/**
 * GrowthDumbbellChart - Growth Leaderboard Visualization
 *
 * A dumbbell/gap chart showing start vs end price for each district,
 * sorted by growth percentage from highest to lowest.
 *
 * - Left dot: First quarter median PSF
 * - Right dot: Latest quarter median PSF
 * - Bar: The growth gap
 * - Sorted: Highest growth at top
 */
export function GrowthDumbbellChart() {
  const { buildApiParams, applyCrossFilter, filters } = usePowerBIFilters();
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  const chartData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

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

      results.push({
        district,
        region: getRegionForDistrict(district),
        startPsf: first.medianPsf,
        endPsf: last.medianPsf,
        startQuarter: first.quarter,
        endQuarter: last.quarter,
        growthPercent,
        shortName: (DISTRICT_NAMES[district] || district).split('/')[0].trim(),
      });
    });

    // Sort by growth percentage (highest first)
    results.sort((a, b) => b.growthPercent - a.growthPercent);

    return results;
  }, [rawData]);

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
          <div className="h-5 w-48 bg-[#EAE0CF]/50 rounded animate-pulse" />
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
          <h3 className="text-sm font-semibold text-[#213448]">Growth Leaderboard</h3>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm text-[#547792]">Unable to load data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#213448]">Growth Leaderboard</h3>
            <p className="text-xs text-[#547792] mt-0.5">
              Start vs End price by district • Sorted by growth %
            </p>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#94B4C1]" />
              <span className="text-[#547792]">Start</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#213448]" />
              <span className="text-[#547792]">End</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scale Header */}
      <div className="px-4 py-2 bg-[#EAE0CF]/10 border-b border-[#94B4C1]/20">
        <div className="flex items-center">
          <div className="w-20 shrink-0" />
          <div className="flex-1 flex justify-between text-[10px] text-[#94B4C1]">
            <span>{formatPrice(minPsf)}</span>
            <span>{formatPrice((minPsf + maxPsf) / 2)}</span>
            <span>{formatPrice(maxPsf)}</span>
          </div>
          <div className="w-16 shrink-0 text-right text-[10px] text-[#94B4C1]">Growth</div>
        </div>
      </div>

      {/* Dumbbell Rows */}
      <div className="divide-y divide-[#94B4C1]/20 max-h-[500px] overflow-y-auto">
        {chartData.map((item, index) => {
          const startPercent = psfToPercent(item.startPsf);
          const endPercent = psfToPercent(item.endPsf);
          const leftPercent = Math.min(startPercent, endPercent);
          const rightPercent = Math.max(startPercent, endPercent);
          const isPositive = item.growthPercent >= 0;
          const regionColor = REGION_COLORS[item.region] || REGION_COLORS.OCR;

          return (
            <div
              key={item.district}
              className="px-4 py-2 hover:bg-[#EAE0CF]/20 cursor-pointer transition-colors group"
              onClick={() => handleDistrictClick(item.district)}
              title={`${DISTRICT_NAMES[item.district]}\n${item.startQuarter}: ${formatPrice(item.startPsf)} → ${item.endQuarter}: ${formatPrice(item.endPsf)}`}
            >
              <div className="flex items-center">
                {/* District Label */}
                <div className="w-20 shrink-0 flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-[#213448]">{item.district}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: regionColor }}
                  />
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
                      backgroundColor: isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                    }}
                  />

                  {/* Start dot (grey) */}
                  <div
                    className="absolute top-1 w-4 h-4 rounded-full bg-[#94B4C1] border-2 border-white shadow-sm transform -translate-x-1/2 group-hover:scale-110 transition-transform"
                    style={{ left: `${startPercent}%` }}
                    title={`Start: ${formatPrice(item.startPsf)} (${item.startQuarter})`}
                  />

                  {/* End dot (colored by region) */}
                  <div
                    className="absolute top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm transform -translate-x-1/2 group-hover:scale-110 transition-transform z-10"
                    style={{
                      left: `${endPercent}%`,
                      backgroundColor: regionColor,
                    }}
                    title={`End: ${formatPrice(item.endPsf)} (${item.endQuarter})`}
                  />
                </div>

                {/* Growth Percentage */}
                <div className="w-16 shrink-0 text-right">
                  <span
                    className={`text-xs font-bold ${
                      isPositive ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {isPositive ? '+' : ''}{item.growthPercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30">
        <div className="flex items-center justify-between text-[10px] text-[#94B4C1]">
          <span>Grey dot: First quarter • Colored dot: Latest quarter</span>
          <span>{chartData.length} districts ranked</span>
        </div>
      </div>
    </div>
  );
}

export default GrowthDumbbellChart;
