import React, { useState } from 'react';
import { GLSDataTable } from '../components/powerbi/GLSDataTable';
import { UpcomingLaunchesTable } from '../components/powerbi/UpcomingLaunchesTable';
import { SupplyWaterfallChart } from '../components/powerbi/SupplyWaterfallChart';
import { ErrorBoundary } from '../components/ui';
import { useChartHeight, MOBILE_CAPS } from '../hooks';
import { REGIONS } from '../constants';

/**
 * Supply & Inventory Insights Page
 *
 * Displays supply-side market data:
 * - Supply Accumulator Waterfall Charts (Regional + District)
 * - Government Land Sales (GLS) data table
 * - Upcoming project launches table
 *
 * IMPORTANT: This page uses LOCAL state for filters, NOT usePowerBIFilters().
 * Per CLAUDE.md Card 13, only Market Pulse uses the sidebar filter context.
 */
export function SupplyInsightsContent() {
  const tableHeight = useChartHeight(400, MOBILE_CAPS.tall);
  const chartHeight = useChartHeight(350, MOBILE_CAPS.medium);

  // Local state for waterfall chart controls
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [includeGls, setIncludeGls] = useState(true);
  const [launchYear, setLaunchYear] = useState(2026);

  // Handle region selection (from chart click or pill)
  const handleRegionSelect = (region) => {
    setSelectedRegion(region === selectedRegion ? null : region);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Supply & Inventory Insights
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Track supply pipeline, government land sales, and upcoming launches
          </p>
        </div>

        {/* Content */}
        <div className="animate-view-enter space-y-4 md:space-y-6">

          {/* ===== Controls Row ===== */}
          <div className="flex flex-wrap items-center gap-4 bg-white rounded-lg border border-[#94B4C1]/50 p-3 md:p-4">
            {/* GLS Toggle */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={includeGls}
                onChange={(e) => setIncludeGls(e.target.checked)}
                className="w-4 h-4 rounded border-[#94B4C1] text-[#213448] focus:ring-[#547792] cursor-pointer"
              />
              <span className="text-sm text-[#213448] group-hover:text-[#547792]">
                Include GLS Pipeline
              </span>
            </label>

            {/* Divider */}
            <div className="hidden sm:block w-px h-6 bg-[#94B4C1]/30" />

            {/* Launch Year Select */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#547792]">Launch Year:</label>
              <select
                value={launchYear}
                onChange={(e) => setLaunchYear(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 rounded-lg border border-[#94B4C1]/50 bg-white text-sm text-[#213448] focus:ring-2 focus:ring-[#547792]/20 focus:border-[#547792] cursor-pointer"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
            </div>
          </div>

          {/* ===== Two-Chart Grid ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

            {/* Chart 1: Regional View */}
            <div className="space-y-3">
              <ErrorBoundary name="Regional Supply Chart" compact>
                <SupplyWaterfallChart
                  view="regional"
                  includeGls={includeGls}
                  launchYear={launchYear}
                  onRegionClick={handleRegionSelect}
                  height={chartHeight}
                />
              </ErrorBoundary>

              {/* Region Selector Pills (below chart) */}
              <div className="flex flex-wrap gap-2 justify-center">
                {REGIONS.map((region) => (
                  <button
                    key={region}
                    onClick={() => handleRegionSelect(region)}
                    className={`
                      px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                      ${selectedRegion === region
                        ? 'bg-[#213448] text-white shadow-md'
                        : 'bg-[#EAE0CF] text-[#213448] hover:bg-[#94B4C1]/30'
                      }
                    `}
                  >
                    {region}
                  </button>
                ))}
                {selectedRegion && (
                  <button
                    onClick={() => setSelectedRegion(null)}
                    className="px-3 py-2 text-xs text-[#547792] hover:text-[#213448] underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Chart 2: District View */}
            <div>
              {selectedRegion ? (
                <div className="space-y-2">
                  {/* Back button */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#547792]">
                      Showing <span className="font-medium text-[#213448]">{selectedRegion}</span> districts
                    </span>
                    <button
                      onClick={() => setSelectedRegion(null)}
                      className="flex items-center gap-1 text-sm text-[#547792] hover:text-[#213448] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to regions
                    </button>
                  </div>

                  <ErrorBoundary name="District Supply Chart" compact>
                    <SupplyWaterfallChart
                      view="district"
                      selectedRegion={selectedRegion}
                      includeGls={includeGls}
                      launchYear={launchYear}
                      height={chartHeight}
                    />
                  </ErrorBoundary>
                </div>
              ) : (
                <div
                  className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col items-center justify-center text-center p-8"
                  style={{ height: chartHeight }}
                >
                  <svg className="w-16 h-16 text-[#94B4C1]/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <h3 className="text-[#213448] font-medium mb-1">District Breakdown</h3>
                  <p className="text-sm text-[#547792]">
                    Click a region bar or select a pill to see district-level data
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ===== Divider ===== */}
          <div className="border-t border-[#94B4C1]/30 my-6" />

          {/* ===== Data Tables ===== */}
          <h2 className="text-base md:text-lg font-semibold text-[#213448] mb-3">
            Detailed Data Tables
          </h2>

          {/* GLS Data Table */}
          <ErrorBoundary name="GLS Data Table" compact>
            <GLSDataTable height={tableHeight} />
          </ErrorBoundary>

          {/* Upcoming Launches Table */}
          <ErrorBoundary name="Upcoming Launches" compact>
            <UpcomingLaunchesTable height={tableHeight} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default SupplyInsightsContent;
