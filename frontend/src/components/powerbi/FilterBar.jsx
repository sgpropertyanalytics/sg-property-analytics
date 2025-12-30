import React, { useState } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilter';
import { PowerBIFilterSidebar } from './PowerBIFilterSidebar';

/**
 * FilterBar - Unified responsive filter component
 *
 * Single source of truth for filter bar UI across all pages.
 * - Desktop (md+): Sticky horizontal control bar with frosted glass
 * - Mobile (<md): Filter button that opens drawer overlay
 *
 * Usage:
 *   <FilterBar />
 *
 * A change here affects ALL pages automatically.
 */
export function FilterBar() {
  const { activeFilterCount } = usePowerBIFilters();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  return (
    <>
      {/* Desktop: Horizontal sticky bar - sticky applied at wrapper level */}
      <div className="hidden md:block sticky top-0 z-30 mb-6">
        <PowerBIFilterSidebar layout="horizontal" />
      </div>

      {/* Mobile: Filter button + drawer */}
      <div className="md:hidden mb-6">
        <div className="p-3 bg-card/60 rounded-md backdrop-blur-sm">
          <button
            onClick={() => setMobileFilterOpen(true)}
            className="w-full min-h-[44px] px-4 flex items-center justify-center gap-2 bg-card/80 rounded-md border border-[#94B4C1]/30 text-[#547792] hover:border-[#547792] active:bg-[#EAE0CF]/50 active:scale-[0.98] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="font-medium text-sm">Filters</span>
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
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileFilterOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 w-full max-w-sm animate-slide-in-right">
              <PowerBIFilterSidebar
                layout="drawer"
                onClose={() => setMobileFilterOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default FilterBar;
