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
 * Has its own INDEPENDENT filter sidebar - filter state is not shared with Market Core.
 */
export function PrimaryMarketContent() {
  // Connect to filter context (our own independent instance)
  const { filters } = usePowerBIFilters();
  // Desktop-first chart height with mobile guardrail
  const chartHeight = useChartHeight(400, MOBILE_CAPS.tall);

  // Sidebar state (independent from DashboardLayout)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  return (
    <div className="flex h-full">
      {/* ===== FILTER SIDEBAR (Independent from Market Core) ===== */}
      {/* Desktop: Always visible, collapsible */}
      <div className="hidden lg:flex flex-shrink-0 relative">
        <div className={`min-w-0 ${sidebarCollapsed ? 'w-12' : 'w-72'}`}>
          <PowerBIFilterSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        {/* Collapse Handle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-3 z-10 w-6 h-10 bg-[#EAE0CF] border border-[#94B4C1]/30 rounded-r-lg shadow-sm flex items-center justify-center hover:bg-[#94B4C1]/30 transition-colors"
          aria-label={sidebarCollapsed ? 'Expand filters' : 'Collapse filters'}
        >
          <svg
            className={`w-4 h-4 text-[#547792] transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Mobile Filter Drawer Overlay */}
      {mobileFilterOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileFilterOpen(false)}
          />
          {/* Filter Drawer */}
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] animate-slide-in-left">
            <PowerBIFilterSidebar
              collapsed={false}
              onToggle={() => setMobileFilterOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden">
        <div className="p-3 md:p-4 lg:p-6">
          {/* Header with mobile filter button */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <PageHeader
              title="Primary Market Analysis"
              subtitle="Compare New Sale vs Recently TOP transactions across the market"
            />

            {/* Mobile filter button */}
            <button
              onClick={() => setMobileFilterOpen(true)}
              className="lg:hidden flex-shrink-0 p-2 rounded-lg bg-[#547792]/10 text-[#547792] hover:bg-[#547792]/20 transition-colors"
              aria-label="Open filters"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
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
