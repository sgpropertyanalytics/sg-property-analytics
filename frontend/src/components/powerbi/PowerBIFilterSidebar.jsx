import React, { useState, useEffect, useCallback } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { TimeGranularityToggle } from './TimeGranularityToggle';
import {
  REGIONS,
  DISTRICT_NAMES,
} from '../../constants';

/**
 * Power BI-style Filter Bar (formerly Sidebar)
 *
 * Contains dropdown/multi-select filters for all dimensions.
 * Defaults all filters to 'All' (no restriction).
 *
 * Layout modes:
 * - horizontal (default): Single row control bar for desktop
 * - drawer: Full-screen drawer for mobile
 */
export function PowerBIFilterSidebar({ layout = 'horizontal', onClose }) {
  const {
    filters,
    filterOptions,
    activeFilterCount,
    setDateRange,
    setDistricts,
    setBedroomTypes,
    toggleBedroomType,
    setSegments,
    toggleSegment,
    resetFilters,
  } = usePowerBIFilters();

  /**
   * Handle filter button click with switch/multi-select behavior
   * - Normal click: Switch to this value only (deselect others)
   * - Shift+click: Add/remove from selection (multi-select)
   * - Click on already-selected single item: Deselect (show all)
   */
  const handleFilterClick = useCallback((e, value, currentSelection, setSingle, toggleMulti) => {
    e.preventDefault();

    if (e.shiftKey) {
      // Shift+click: toggle (add/remove)
      toggleMulti(value);
    } else {
      // Normal click: switch to single selection
      if (currentSelection.length === 1 && currentSelection[0] === value) {
        // Clicking the only selected item → deselect (show all)
        setSingle([]);
      } else {
        // Switch to this item only
        setSingle([value]);
      }
    }
  }, []);

  // Date preset state: '3M', '12M', '2Y', '5Y', 'custom', or null (all data)
  const [datePreset, setDatePreset] = useState(null);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Calculate date range for a preset relative to the latest data date
  // Fix: Fallback to today if maxDate not loaded yet (prevents silent no-op)
  // Fix: Snap to 1st of month because URA data is month-level only
  const calculatePresetDateRange = useCallback((preset, maxDateStr) => {
    // Fallback to today if filter options haven't loaded yet
    const effectiveMaxDate = maxDateStr || new Date().toISOString().split('T')[0];
    const maxDate = new Date(effectiveMaxDate);
    let startDate;

    switch (preset) {
      case '3M':
        startDate = new Date(maxDate);
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case '12M':
        startDate = new Date(maxDate);
        startDate.setMonth(startDate.getMonth() - 12);
        break;
      case '2Y':
        startDate = new Date(maxDate);
        startDate.setFullYear(startDate.getFullYear() - 2);
        break;
      case '5Y':
        startDate = new Date(maxDate);
        startDate.setFullYear(startDate.getFullYear() - 5);
        break;
      default:
        return { start: null, end: null };
    }

    // CRITICAL: Snap to 1st of month for URA data compatibility
    // URA transaction data is month-level only - all transactions within a month
    // are dated to the 1st of that month. Without this, a date like "2024-12-28"
    // would exclude December 2024 transactions (dated 2024-12-01).
    startDate.setDate(1);

    // Format as YYYY-MM-DD
    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      start: formatDate(startDate),
      end: effectiveMaxDate
    };
  }, []);

  // Mark as initialized when filter options load (no default filter applied)
  useEffect(() => {
    if (!hasInitialized && filterOptions.dateRange.max && !filterOptions.loading) {
      setHasInitialized(true);
    }
  }, [filterOptions.dateRange.max, filterOptions.loading, hasInitialized]);

  // Handle preset button click
  const handlePresetClick = useCallback((preset) => {
    if (preset === datePreset) {
      // Clicking same preset clears it (show all data)
      setDateRange(null, null);
      setDatePreset(null);
    } else if (preset === 'ALL') {
      setDateRange(null, null);
      setDatePreset(null);
    } else {
      const { start, end } = calculatePresetDateRange(preset, filterOptions.dateRange.max);
      if (start && end) {
        setDateRange(start, end);
        setDatePreset(preset);
      }
    }
    setShowDateDropdown(false);
  }, [datePreset, filterOptions.dateRange.max, calculatePresetDateRange, setDateRange]);

  // Wrap resetFilters to also reset local datePreset state
  const handleResetFilters = useCallback(() => {
    resetFilters();
    setDatePreset(null);
  }, [resetFilters]);

  // Get display text for date preset
  const getDateDisplayText = () => {
    if (!datePreset || datePreset === 'ALL') return 'All Time';
    const labels = { '3M': '3 Months', '12M': '12 Months', '2Y': '2 Years', '5Y': '5 Years' };
    return labels[datePreset] || 'All Time';
  };

  // Horizontal Control Bar Layout (Desktop)
  if (layout === 'horizontal') {
    return (
      <div className="flex flex-wrap items-center gap-3 p-4 bg-card/60 rounded-lg border border-[#94B4C1]/20 backdrop-blur-sm">
        {/* Region/Segment Buttons */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-[#547792] mr-1 hidden sm:inline">Region</span>
          <div className="flex gap-1">
            {REGIONS.map(seg => (
              <button
                type="button"
                key={seg}
                onClick={(e) => handleFilterClick(e, seg, filters.segments, setSegments, toggleSegment)}
                className={`
                  min-h-[36px] px-3 py-1.5 rounded-md text-sm font-medium
                  transition-colors duration-100 select-none active:scale-[0.98]
                  ${filters.segments.includes(seg)
                    ? 'bg-[#213448] text-white'
                    : 'bg-card border border-[#94B4C1] text-[#547792] hover:border-[#547792] hover:text-[#213448]'
                  }
                `}
                title="Shift+click to multi-select"
              >
                {seg}
              </button>
            ))}
          </div>
        </div>

        {/* Separator */}
        <div className="hidden lg:block w-px h-6 bg-[#94B4C1]/30" />

        {/* District Dropdown */}
        <DistrictDropdown
          options={(filterOptions.districtsRaw || []).map(d => {
            const areaName = DISTRICT_NAMES[d];
            const shortName = areaName ? areaName.split(',')[0].substring(0, 18) : d;
            return {
              value: d,
              label: areaName ? `${d} (${shortName})` : d
            };
          })}
          selected={filters.districts}
          onChange={setDistricts}
        />

        {/* Separator */}
        <div className="hidden lg:block w-px h-6 bg-[#94B4C1]/30" />

        {/* Bedroom Pills */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-[#547792] mr-1 hidden sm:inline">Size</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(br => (
              <button
                type="button"
                key={br}
                onClick={(e) => handleFilterClick(e, br, filters.bedroomTypes, setBedroomTypes, toggleBedroomType)}
                className={`
                  min-h-[36px] min-w-[44px] px-2.5 py-1.5 rounded-md text-xs font-medium
                  transition-colors duration-100 select-none active:scale-[0.98]
                  ${filters.bedroomTypes.includes(br)
                    ? 'bg-[#213448] text-white'
                    : 'bg-card border border-[#94B4C1] text-[#547792] hover:border-[#547792] hover:text-[#213448]'
                  }
                `}
                title="Shift+click to multi-select"
              >
                {br === 5 ? '5BR+' : `${br}BR`}
              </button>
            ))}
          </div>
        </div>

        {/* Separator */}
        <div className="hidden lg:block w-px h-6 bg-[#94B4C1]/30" />

        {/* Date Preset Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDateDropdown(!showDateDropdown)}
            className={`
              min-h-[36px] px-3 py-1.5 rounded-md text-sm font-medium
              flex items-center gap-2
              transition-colors duration-100 select-none active:scale-[0.98]
              ${datePreset
                ? 'bg-[#213448] text-white'
                : 'bg-card border border-[#94B4C1] text-[#547792] hover:border-[#547792]'
              }
            `}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="truncate max-w-[100px]">{getDateDisplayText()}</span>
            <svg
              className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showDateDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDateDropdown && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-card rounded-lg border border-[#94B4C1]/50 shadow-lg z-50 py-1">
              {[
                { value: '3M', label: '3 Months' },
                { value: '12M', label: '12 Months' },
                { value: '2Y', label: '2 Years' },
                { value: '5Y', label: '5 Years' },
                { value: 'ALL', label: 'All Time' },
              ].map((preset) => {
                const isActive = datePreset === preset.value || (!datePreset && preset.value === 'ALL');
                return (
                  <button
                    key={preset.value}
                    onClick={() => handlePresetClick(preset.value)}
                    className={`
                      w-full min-h-[44px] px-4 py-2 text-left
                      flex items-center justify-between
                      transition-colors duration-100
                      ${isActive
                        ? 'bg-[#EAE0CF]/50 text-[#213448]'
                        : 'text-[#547792] hover:bg-[#EAE0CF]/30 hover:text-[#213448]'
                      }
                    `}
                  >
                    <span className="text-sm font-medium">{preset.label}</span>
                    {isActive && (
                      <svg className="w-4 h-4 text-[#213448]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="hidden lg:block w-px h-6 bg-[#94B4C1]/30" />

        {/* Time Grouping Toggle */}
        <TimeGranularityToggle />

        {/* Spacer to push Clear to far right */}
        <div className="flex-1" />

        {/* Clear filters button */}
        {activeFilterCount > 0 && (
          <button
            onClick={handleResetFilters}
            className="min-h-[36px] px-3 py-1.5 text-sm text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF]/30 rounded-md transition-colors active:scale-[0.98]"
          >
            Clear all
          </button>
        )}
      </div>
    );
  }

  // Drawer Layout (Mobile)
  if (layout === 'drawer') {
    return (
      <div className="flex flex-col h-full bg-card">
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
            <div className="grid grid-cols-3 gap-2">
              {REGIONS.map(seg => (
                <button
                  type="button"
                  key={seg}
                  onClick={(e) => handleFilterClick(e, seg, filters.segments, setSegments, toggleSegment)}
                  className={`min-h-[44px] py-2.5 text-sm rounded-md border transition-colors ${
                    filters.segments.includes(seg)
                      ? 'bg-[#213448] text-white border-[#213448]'
                      : 'bg-card text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                  }`}
                >
                  {seg}
                </button>
              ))}
            </div>
          </div>

          {/* District */}
          <div>
            <label className="block text-sm font-medium text-[#213448] mb-2">District</label>
            <DistrictDropdown
              options={(filterOptions.districtsRaw || []).map(d => {
                const areaName = DISTRICT_NAMES[d];
                const shortName = areaName ? areaName.split(',')[0].substring(0, 18) : d;
                return {
                  value: d,
                  label: areaName ? `${d} (${shortName})` : d
                };
              })}
              selected={filters.districts}
              onChange={setDistricts}
              fullWidth
            />
          </div>

          {/* Bedroom */}
          <div>
            <label className="block text-sm font-medium text-[#213448] mb-2">Unit Size</label>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map(br => (
                <button
                  type="button"
                  key={br}
                  onClick={(e) => handleFilterClick(e, br, filters.bedroomTypes, setBedroomTypes, toggleBedroomType)}
                  className={`min-h-[44px] py-2.5 text-xs rounded-md border transition-colors ${
                    filters.bedroomTypes.includes(br)
                      ? 'bg-[#213448] text-white border-[#213448]'
                      : 'bg-card text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                  }`}
                >
                  {br === 5 ? '5BR+' : `${br}BR`}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-[#213448] mb-2">Time Period</label>
            <div className="grid grid-cols-4 gap-2">
              {['3M', '12M', '2Y', '5Y'].map(preset => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => handlePresetClick(preset)}
                  className={`min-h-[44px] py-2 text-sm rounded-md border transition-colors ${
                    datePreset === preset
                      ? 'bg-[#213448] text-white border-[#213448]'
                      : 'bg-card text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Time Grouping */}
          <div>
            <label className="block text-sm font-medium text-[#213448] mb-2">Group By</label>
            <TimeGranularityToggle />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-[#94B4C1]/30 bg-card" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-3">
            {activeFilterCount > 0 && (
              <button
                onClick={handleResetFilters}
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
    );
  }

  return null;
}

// ===== Helper Components =====

function DistrictDropdown({ options, selected, onChange, fullWidth = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = search
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase()) ||
        opt.value.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const handleToggle = (value, e) => {
    if (e) e.stopPropagation();
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const getDisplayText = () => {
    if (selected.length === 0) return 'All Districts';
    if (selected.length === 1) {
      const selectedOption = options.find(opt => opt.value === selected[0]);
      return selectedOption?.label || selected[0];
    }
    return `${selected.length} districts`;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (!e.target.closest('.district-dropdown')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);

  return (
    <div className={`relative district-dropdown ${fullWidth ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          ${fullWidth ? 'w-full' : 'min-w-[140px]'}
          min-h-[36px] px-3 py-1.5 rounded-md text-sm
          flex items-center justify-between gap-2
          transition-colors duration-100 select-none active:scale-[0.98]
          ${selected.length > 0
            ? 'bg-[#213448] text-white'
            : 'bg-card border border-[#94B4C1] text-[#547792] hover:border-[#547792]'
          }
        `}
      >
        <span className="truncate">{getDisplayText()}</span>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className={`absolute top-full left-0 mt-1 ${fullWidth ? 'w-full' : 'w-64'} bg-card rounded-lg border border-[#94B4C1]/50 shadow-lg z-50 overflow-hidden`}>
          {/* Search */}
          <div className="p-2 border-b border-[#94B4C1]/30">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search districts..."
              className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded-md focus:outline-none focus:ring-2 focus:ring-[#547792] bg-white"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options */}
          <div className="max-h-60 overflow-y-auto">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="w-full px-3 py-2 text-xs text-left text-[#547792] hover:bg-[#EAE0CF]/30 border-b border-[#94B4C1]/20"
              >
                Clear selection
              </button>
            )}
            {filteredOptions.map(opt => (
              <label
                key={opt.value}
                className="flex items-center px-3 py-2 hover:bg-[#EAE0CF]/30 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={(e) => handleToggle(opt.value, e)}
                  className="mr-2 rounded border-[#94B4C1] text-[#547792] focus:ring-[#547792]"
                />
                <span className="text-sm text-[#213448]">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PowerBIFilterSidebar;
