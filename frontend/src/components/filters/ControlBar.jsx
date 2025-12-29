/**
 * ControlBar - Horizontal filter bar container
 *
 * Layout:
 * - Desktop (lg+): Single row, all filters visible
 * - Tablet (md): Flex wrap, 2 rows if needed
 * - Mobile (<md): Compact "Filters" button → drawer
 */

import { useState } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { RegionDropdown } from './RegionDropdown';
import { DistrictCombobox } from './DistrictCombobox';
import { BedroomPills } from './BedroomPills';
import { DateRangePicker } from './DateRangePicker';
import { MobileFilterDrawer } from './MobileFilterDrawer';

export function ControlBar() {
  const { activeFilterCount, resetFilters } = usePowerBIFilters();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  return (
    <>
      {/* Desktop/Tablet: Horizontal bar */}
      <div className="hidden md:flex flex-wrap items-center gap-3 p-4 bg-[#EAE0CF]/40 rounded-lg border border-[#94B4C1]/20">
        <RegionDropdown />
        <DistrictCombobox />

        {/* Separator */}
        <div className="hidden lg:block w-px h-6 bg-[#94B4C1]/30" />

        <BedroomPills />

        {/* Separator */}
        <div className="hidden lg:block w-px h-6 bg-[#94B4C1]/30" />

        <DateRangePicker />

        {/* Clear filters button */}
        {activeFilterCount > 0 && (
          <>
            <div className="hidden lg:block w-px h-6 bg-[#94B4C1]/30" />
            <button
              onClick={resetFilters}
              className="min-h-[36px] px-3 py-1.5 text-sm text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF]/30 rounded-md transition-colors active:scale-[0.98]"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* Mobile: Filters button */}
      <div className="md:hidden p-3 bg-[#EAE0CF]/40 rounded-lg">
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="w-full min-h-[44px] px-4 flex items-center justify-center gap-2 bg-white/80 rounded-lg border border-[#94B4C1]/30 text-[#547792] hover:border-[#547792] active:bg-[#EAE0CF]/50 active:scale-[0.98] transition-colors"
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

      {/* Mobile drawer */}
      <MobileFilterDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
      />
    </>
  );
}

export default ControlBar;
