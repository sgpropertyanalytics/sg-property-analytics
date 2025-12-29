import React, { useState } from 'react';
import { PowerBIFilterProvider, usePowerBIFilters } from '../context/PowerBIFilterContext';
import { PowerBIFilterSidebar } from '../components/powerbi/PowerBIFilterSidebar';
import { NewVsResaleChart } from '../components/powerbi/NewVsResaleChart';
import { ErrorBoundary, ChartWatermark } from '../components/ui';
import { useChartHeight, MOBILE_CAPS } from '../hooks';
import { PageHeader } from '../components/ui';

/**
 * Primary Market Page - New Sale vs Resale Comparison
 *
 * This page is dedicated to comparing New Sale and Resale market segments.
 * Unlike Market Core (which is Resale-only), this page shows both sale types.
 *
 * Has its own INDEPENDENT filter context - filter state is not shared with Market Core.
 */
export function PrimaryMarketContent() {
  // Connect to filter context (our own independent instance)
  const { activeFilterCount } = usePowerBIFilters();
  // Desktop-first chart height with mobile guardrail
  const chartHeight = useChartHeight(400, MOBILE_CAPS.tall);

  // Mobile filter drawer state
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  return (
    <div className="h-full bg-[#EAE0CF]/40">
      {/* Main Content Area - Scrollable */}
      <div className="h-full overflow-y-auto overflow-x-hidden">
        <div className="p-3 md:p-4 lg:p-6">
          {/* Header */}
          <div className="mb-4 md:mb-6">
            <PageHeader
              title="Primary Market Analysis"
              subtitle="Compare New Sale vs Recently TOP transactions across the market"
            />
          </div>

          {/* Filter Bar - Horizontal filter controls (sticky) */}
          <div className="mb-6">
            {/* Desktop: Horizontal bar */}
            <div className="hidden md:block">
              <PowerBIFilterSidebar layout="horizontal" />
            </div>
            {/* Mobile: Filter button + drawer */}
            <div className="md:hidden">
              <div className="p-3 bg-card/60 rounded-lg backdrop-blur-sm">
                <button
                  onClick={() => setMobileFilterOpen(true)}
                  className="w-full min-h-[44px] px-4 flex items-center justify-center gap-2 bg-card/80 rounded-lg border border-[#94B4C1]/30 text-[#547792] hover:border-[#547792] active:bg-[#EAE0CF]/50 active:scale-[0.98] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span className="font-medium">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="bg-[#213448] text-white text-xs font-medium px-2 py-0.5 rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Mobile Filter Drawer */}
              {mobileFilterOpen && (
                <div className="fixed inset-0 z-50">
                  <div className="absolute inset-0 bg-black/50" onClick={() => setMobileFilterOpen(false)} />
                  <div className="absolute inset-y-0 right-0 w-full max-w-sm animate-slide-in-right">
                    <PowerBIFilterSidebar layout="drawer" onClose={() => setMobileFilterOpen(false)} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chart Grid */}
          <div className="animate-view-enter">
            {/* New Sale vs Recently TOP Chart - Full width */}
            <ErrorBoundary name="New vs Resale Chart" compact>
              <ChartWatermark>
                <NewVsResaleChart height={chartHeight} />
              </ChartWatermark>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Standalone PrimaryMarket with Independent Filter Context
 *
 * This page has its own PowerBIFilterProvider, completely isolated from Market Core.
 * Filter selections here do NOT affect Market Core and vice versa.
 */
export default function PrimaryMarket() {
  return (
    <PowerBIFilterProvider>
      <PrimaryMarketContent />
    </PowerBIFilterProvider>
  );
}
