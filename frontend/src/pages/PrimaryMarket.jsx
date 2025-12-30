import React, { useState } from 'react';
import { PowerBIFilterProvider } from '../context/PowerBIFilter';
import { FilterBar } from '../components/powerbi/FilterBar';
import { NewVsResaleChart } from '../components/powerbi/NewVsResaleChart';
import { NewLaunchTimelineChart } from '../components/powerbi/NewLaunchTimelineChart';
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
  // Desktop-first chart height with mobile guardrail
  const chartHeight = useChartHeight(400, MOBILE_CAPS.tall);

  // 2020 Q4 data is heavily skewed - exclude by default
  const [include2020Q4, setInclude2020Q4] = useState(false);

  return (
    <div className="min-h-full bg-[#EAE0CF]/40">
      {/* Main Content Area - scrolling handled by parent DashboardLayout */}
      <div className="p-3 md:p-4 lg:p-6">
          {/* Header */}
          <div className="mb-4 md:mb-6">
            <div className="flex items-start justify-between gap-4">
              <PageHeader
                title="New Launch Market"
                subtitle="Compare New Sale vs Recently TOP transactions across the market"
              />
              {/* Toggle for 2020 Q4 data */}
              <button
                onClick={() => setInclude2020Q4(!include2020Q4)}
                className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  include2020Q4
                    ? 'bg-[#213448] text-white border-[#213448]'
                    : 'bg-white text-[#547792] border-[#94B4C1] hover:bg-[#EAE0CF]/50'
                }`}
              >
                {include2020Q4 ? 'Hide 2020 Q4' : 'Include 2020 Q4'}
              </button>
            </div>
          </div>

          {/* Filter Bar - Unified component (desktop: sticky horizontal, mobile: drawer) */}
          <FilterBar />

          {/* Chart Grid */}
          <div className="animate-view-enter space-y-4 md:space-y-6">
            {/* New Sale vs Recently TOP Chart - Full width */}
            <ErrorBoundary name="New vs Resale Chart" compact>
              <ChartWatermark>
                <NewVsResaleChart height={chartHeight} include2020Q4={include2020Q4} />
              </ChartWatermark>
            </ErrorBoundary>

            {/* New Launch Activity Timeline - Projects launched per period */}
            <ErrorBoundary name="New Launch Timeline Chart" compact>
              <ChartWatermark>
                <NewLaunchTimelineChart height={chartHeight} include2020Q4={include2020Q4} />
              </ChartWatermark>
            </ErrorBoundary>
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
