/**
 * MobileFilterDrawer - Full-screen drawer for mobile filter selection
 *
 * Contains all filter components stacked vertically with:
 * - Sticky header with title and close button
 * - Scrollable content area
 * - Sticky footer with Apply button
 */

import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { RegionDropdown } from './RegionDropdown';
import { DistrictCombobox } from './DistrictCombobox';
import { BedroomPills } from './BedroomPills';
import { DateRangePicker } from './DateRangePicker';

export function MobileFilterDrawer({ isOpen, onClose }) {
  const { activeFilterCount, resetFilters } = usePowerBIFilters();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-white flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-[#94B4C1]/30">
          <h2 className="text-lg font-semibold text-[#213448]">Filters</h2>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-[#EAE0CF]/30 active:bg-[#EAE0CF]/50 transition-colors"
            aria-label="Close filters"
          >
            <svg className="w-6 h-6 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Region */}
          <div>
            <label className="block text-sm font-medium text-[#213448] mb-2">Region</label>
            <RegionDropdown />
          </div>

          {/* District */}
          <div>
            <label className="block text-sm font-medium text-[#213448] mb-2">District</label>
            <DistrictCombobox />
          </div>

          {/* Bedroom */}
          <div>
            <label className="block text-sm font-medium text-[#213448] mb-2">Unit Size</label>
            <BedroomPills />
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-[#213448] mb-2">Time Period</label>
            <DateRangePicker />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-[#94B4C1]/30 bg-white" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-3">
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  resetFilters();
                }}
                className="flex-1 min-h-[48px] px-4 py-3 rounded-lg border border-[#94B4C1] text-[#547792] font-medium hover:border-[#547792] active:bg-[#EAE0CF]/30 transition-colors"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 min-h-[48px] px-4 py-3 rounded-lg bg-[#213448] text-white font-medium hover:bg-[#547792] active:scale-[0.98] transition-all"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MobileFilterDrawer;
