import React, { useState, useEffect, useCallback } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import {
  REGIONS,
  DISTRICT_NAMES,
} from '../../constants';
import { TimeGranularityToggle } from './TimeGranularityToggle';
// SaleType filter removed - Market Core is Resale-only

/**
 * Power BI-style Filter Sidebar
 *
 * Contains dropdown/multi-select filters for all dimensions.
 * Defaults all filters to 'All' (no restriction).
 *
 * Layout modes:
 * - sidebar (default): Original vertical sidebar
 * - horizontal: Horizontal control bar for desktop
 * - drawer: Full-screen drawer for mobile
 */
export function PowerBIFilterSidebar({ collapsed = false, onToggle: _onToggle, layout = 'sidebar', onClose }) {
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

  const [expandedSections, setExpandedSections] = useState({
    location: true,
    date: true,
    roomSize: true,
    propertyDetails: true,
  });

  // Date preset state: '3M', '6M', '12M', '2Y', '5Y', 'custom', or null (all data)
  const [datePreset, setDatePreset] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      case '6M':
        startDate = new Date(maxDate);
        startDate.setMonth(startDate.getMonth() - 6);
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
    } else {
      const { start, end } = calculatePresetDateRange(preset, filterOptions.dateRange.max);
      if (start && end) {
        setDateRange(start, end);
        setDatePreset(preset);
      }
    }
  }, [datePreset, filterOptions.dateRange.max, calculatePresetDateRange, setDateRange]);

  // Detect custom date changes (when user manually edits)
  const handleCustomDateChange = useCallback((start, end) => {
    setDateRange(start, end);
    // If either date is set, mark as custom (unless it matches a preset)
    if (start || end) {
      setDatePreset('custom');
    } else {
      setDatePreset(null);
    }
  }, [setDateRange]);

  // Wrap resetFilters to also reset local datePreset state
  const handleResetFilters = useCallback(() => {
    resetFilters();
    // Reset to no filter (all data)
    setDatePreset(null);
    setShowAdvanced(false);
  }, [resetFilters]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // ==================== HORIZONTAL LAYOUT ====================
  // Toolbar-style control bar with implicit labels (no labels, use dividers)
  // Frosted glass - sticky handled by parent FilterBar wrapper
  if (layout === 'horizontal') {
    return (
      <div className="-mx-3 md:-mx-4 lg:-mx-6 px-3 md:px-4 lg:px-6 py-3 bg-[#EAE0CF]/70 backdrop-blur-md border-b border-[#94B4C1]/30 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Region/Segment Buttons - implicit label via button content */}
          <div className="flex gap-1">
            {REGIONS.map(seg => (
              <button
                type="button"
                key={seg}
                onClick={(e) => handleFilterClick(e, seg, filters.segments, setSegments, toggleSegment)}
                className={`min-h-[44px] px-3 py-2 text-sm rounded-md border transition-colors ${
                  filters.segments.includes(seg)
                    ? 'bg-[#547792] text-white border-[#547792]'
                    : filters.segments.length === 0
                      ? 'bg-white text-[#213448] border-[#94B4C1]'
                      : 'bg-white text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                }`}
                title="Shift+click to multi-select"
              >
                {seg}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-[#94B4C1]/40" />

          {/* District Dropdown */}
          <MultiSelectDropdown
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
            placeholder="All Districts"
            searchable
            compact
          />

          {/* Divider */}
          <div className="w-px h-8 bg-[#94B4C1]/40" />

          {/* Bedroom Pills - implicit label via button content */}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(br => (
              <button
                type="button"
                key={br}
                onClick={(e) => handleFilterClick(e, br, filters.bedroomTypes, setBedroomTypes, toggleBedroomType)}
                className={`min-h-[44px] min-w-[44px] px-2 py-2 text-sm rounded-md border transition-colors ${
                  filters.bedroomTypes.includes(br)
                    ? 'bg-[#547792] text-white border-[#547792]'
                    : filters.bedroomTypes.length === 0
                      ? 'bg-white text-[#213448] border-[#94B4C1]'
                      : 'bg-white text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                }`}
                title="Shift+click to multi-select"
              >
                {br === 5 ? '5BR+' : `${br}BR`}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-[#94B4C1]/40" />

          {/* Period Preset Buttons - implicit label via button content */}
          <div className="flex gap-1">
            {['3M', '6M', '12M', '2Y', '5Y'].map(preset => (
              <button
                type="button"
                key={preset}
                onClick={(e) => { e.preventDefault(); handlePresetClick(preset); }}
                disabled={filterOptions.loading}
                className={`min-h-[44px] px-3 py-2 text-sm rounded-md border transition-colors ${
                  filterOptions.loading
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
                    : datePreset === preset
                      ? 'bg-[#547792] text-white border-[#547792]'
                      : 'bg-white text-[#213448] border-[#94B4C1] hover:border-[#547792] hover:bg-[#EAE0CF]/50'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-[#94B4C1]/40" />

          {/* Time Granularity Toggle - Group by Year/Quarter/Month */}
          <TimeGranularityToggle layout="horizontal" />

          {/* Spacer to push Clear to far right */}
          <div className="flex-1" />

          {/* Clear filters button */}
          {activeFilterCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="min-h-[44px] px-3 py-2 text-sm text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF]/30 rounded-md transition-colors active:scale-[0.98]"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    );
  }

  // ==================== DRAWER LAYOUT (Mobile) ====================
  if (layout === 'drawer') {
    return (
      <div className="flex flex-col h-full bg-card">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-[#94B4C1]/30">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#213448]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="font-semibold text-[#213448]">Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-[#547792] text-white text-xs px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </div>
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

        {/* Content - Same sections as sidebar */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Location Section */}
          <FilterSection
            title="Location"
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            expanded={expandedSections.location}
            onToggle={() => toggleSection('location')}
            activeCount={
              (filters.segments.length > 0 ? 1 : 0) +
              (filters.districts.length > 0 ? 1 : 0)
            }
          >
            <FilterGroup label="Market Segment">
              <div className="grid grid-cols-3 gap-2">
                {REGIONS.map(seg => (
                  <button
                    type="button"
                    key={seg}
                    onClick={(e) => handleFilterClick(e, seg, filters.segments, setSegments, toggleSegment)}
                    className={`min-h-[44px] py-2.5 text-sm rounded-md border transition-colors ${
                      filters.segments.includes(seg)
                        ? 'bg-[#547792] text-white border-[#547792]'
                        : filters.segments.length === 0
                          ? 'bg-white text-[#213448] border-[#94B4C1]'
                          : 'bg-white text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                    }`}
                  >
                    {seg}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-2 italic">
                Click to switch, Shift+click to multi-select
              </p>
            </FilterGroup>

            <FilterGroup label="Districts">
              <MultiSelectDropdown
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
                placeholder="All Districts"
                searchable
              />
            </FilterGroup>
          </FilterSection>

          {/* Bedroom Size Section */}
          <FilterSection
            title="Bedroom Size"
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            expanded={expandedSections.roomSize}
            onToggle={() => toggleSection('roomSize')}
            activeCount={filters.bedroomTypes.length > 0 ? 1 : 0}
          >
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map(br => (
                <button
                  type="button"
                  key={br}
                  onClick={(e) => handleFilterClick(e, br, filters.bedroomTypes, setBedroomTypes, toggleBedroomType)}
                  className={`min-h-[44px] py-2 text-sm rounded-md border transition-colors ${
                    filters.bedroomTypes.includes(br)
                      ? 'bg-[#547792] text-white border-[#547792]'
                      : filters.bedroomTypes.length === 0
                        ? 'bg-white text-[#213448] border-[#94B4C1]'
                        : 'bg-white text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                  }`}
                >
                  {br === 5 ? '5BR+' : `${br}BR`}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1 italic">
              Click to switch, Shift+click to multi-select
            </p>
          </FilterSection>

          {/* Date Section */}
          <FilterSection
            title="Date"
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            expanded={expandedSections.date}
            onToggle={() => toggleSection('date')}
            activeCount={filters.dateRange.start || filters.dateRange.end ? 1 : 0}
          >
            <div className="grid grid-cols-5 gap-1.5">
              {['3M', '6M', '12M', '2Y', '5Y'].map(preset => (
                <button
                  type="button"
                  key={preset}
                  onClick={(e) => { e.preventDefault(); handlePresetClick(preset); }}
                  disabled={filterOptions.loading}
                  className={`min-h-[44px] py-2 text-sm rounded-md border transition-colors ${
                    filterOptions.loading
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
                      : datePreset === preset
                        ? 'bg-[#547792] text-white border-[#547792]'
                        : 'bg-white text-[#213448] border-[#94B4C1] hover:border-[#547792] hover:bg-[#EAE0CF]/50'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            {!filterOptions.dateRange.max && !filterOptions.loading && (
              <div className="text-[10px] text-amber-600 mt-1">
                Using today as anchor (data range loading...)
              </div>
            )}
            {datePreset === 'custom' && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-[#547792] font-medium">Custom range selected</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePresetClick('12M'); }}
                  className="text-xs text-[#547792] hover:text-[#213448] underline"
                >
                  Reset to 12M
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }}
              className="flex items-center gap-1 mt-3 text-xs text-[#547792] hover:text-[#213448] transition-colors"
            >
              <span>Custom dates</span>
              <svg
                className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showAdvanced && (
              <div className="space-y-2 mt-2 pt-2 border-t border-[#94B4C1]/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-10">From</span>
                  <input
                    type="month"
                    value={filters.dateRange.start ? filters.dateRange.start.substring(0, 7) : ''}
                    onChange={(e) => handleCustomDateChange(e.target.value ? `${e.target.value}-01` : null, filters.dateRange.end)}
                    className="flex-1 px-2 py-2.5 min-h-[44px] text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={filterOptions.dateRange.min ? filterOptions.dateRange.min.substring(0, 7) : undefined}
                    max={filterOptions.dateRange.max ? filterOptions.dateRange.max.substring(0, 7) : undefined}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-10">To</span>
                  <input
                    type="month"
                    value={filters.dateRange.end ? filters.dateRange.end.substring(0, 7) : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [year, month] = e.target.value.split('-');
                        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                        handleCustomDateChange(filters.dateRange.start, `${e.target.value}-${String(lastDay).padStart(2, '0')}`);
                      } else {
                        handleCustomDateChange(filters.dateRange.start, null);
                      }
                    }}
                    className="flex-1 px-2 py-2.5 min-h-[44px] text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={filterOptions.dateRange.min ? filterOptions.dateRange.min.substring(0, 7) : undefined}
                    max={filterOptions.dateRange.max ? filterOptions.dateRange.max.substring(0, 7) : undefined}
                  />
                </div>
              </div>
            )}
            {filterOptions.dateRange.min && filterOptions.dateRange.max && (
              <div className="text-[10px] text-slate-500 mt-2 italic">
                Data: {new Date(filterOptions.dateRange.min).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })} to {new Date(filterOptions.dateRange.max).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
              </div>
            )}
          </FilterSection>

          {/* Time Grouping Section (Mobile) */}
          <div className="px-4 py-3 border-b border-[#94B4C1]/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#213448]">Group by</span>
              <TimeGranularityToggle className="flex-shrink-0" />
            </div>
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

  // ==================== ORIGINAL SIDEBAR LAYOUT ====================
  if (collapsed) {
    return (
      <div className="w-12 bg-[#EAE0CF] border-r border-[#94B4C1]/30 flex flex-col items-center py-4 h-full">
        {/* Filter icon */}
        <div className="p-2">
          <svg className="w-5 h-5 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </div>
        {activeFilterCount > 0 && (
          <span className="mt-2 bg-[#547792] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full bg-[#EAE0CF] border-r border-[#94B4C1]/30 flex flex-col h-full overflow-hidden">
      {/* Header - Sand/Cream background with Navy text */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center justify-between bg-[#EAE0CF]">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#213448]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="font-semibold text-[#213448]">Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-[#547792] text-white text-xs px-2 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        {/* Clear all button - only show when filters are active */}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); handleResetFilters(); }}
            className="text-xs text-[#547792] hover:text-[#213448] px-2 py-1 rounded hover:bg-[#94B4C1]/30 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>


      {/* Filter sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Location Section */}
        <FilterSection
          title="Location"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          expanded={expandedSections.location}
          onToggle={() => toggleSection('location')}
          activeCount={
            (filters.segments.length > 0 ? 1 : 0) +
            (filters.districts.length > 0 ? 1 : 0)
          }
        >
          {/* Market Segment Buttons - click to switch, shift+click to multi-select */}
          <FilterGroup label="Market Segment">
            <div className="grid grid-cols-3 gap-2">
              {REGIONS.map(seg => (
                <button
                  type="button"
                  key={seg}
                  onClick={(e) => handleFilterClick(e, seg, filters.segments, setSegments, toggleSegment)}
                  className={`min-h-[44px] py-2.5 text-sm rounded-md border transition-colors ${
                    filters.segments.includes(seg)
                      ? 'bg-[#547792] text-white border-[#547792]'
                      : filters.segments.length === 0
                        ? 'bg-white text-[#213448] border-[#94B4C1]'
                        : 'bg-white text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                  }`}
                >
                  {seg}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-2 italic">
              Click to switch, Shift+click to multi-select
            </p>
          </FilterGroup>

          {/* Districts Multi-select */}
          <FilterGroup label="Districts">
            <MultiSelectDropdown
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
              placeholder="All Districts"
              searchable
            />
          </FilterGroup>
        </FilterSection>

        {/* Bedroom Size Section */}
        <FilterSection
          title="Bedroom Size"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
          expanded={expandedSections.roomSize}
          onToggle={() => toggleSection('roomSize')}
          activeCount={filters.bedroomTypes.length > 0 ? 1 : 0}
        >
          {/* Bedroom Type Buttons - click to switch, shift+click to multi-select */}
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map(br => (
              <button
                type="button"
                key={br}
                onClick={(e) => handleFilterClick(e, br, filters.bedroomTypes, setBedroomTypes, toggleBedroomType)}
                className={`min-h-[44px] py-2 text-sm rounded-md border transition-colors ${
                  filters.bedroomTypes.includes(br)
                    ? 'bg-[#547792] text-white border-[#547792]'
                    : filters.bedroomTypes.length === 0
                      ? 'bg-white text-[#213448] border-[#94B4C1]'
                      : 'bg-white text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                }`}
              >
                {br === 5 ? '5BR+' : `${br}BR`}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 italic">
            Click to switch, Shift+click to multi-select
          </p>
        </FilterSection>

        {/* Date Section - moved after Bedroom Size */}
        <FilterSection
          title="Date"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
          expanded={expandedSections.date}
          onToggle={() => toggleSection('date')}
          activeCount={filters.dateRange.start || filters.dateRange.end ? 1 : 0}
        >
          {/* Preset Buttons - Primary interaction */}
          {/* Shows loading indicator when filter options not ready, buttons still work with fallback to today */}
          <div className="grid grid-cols-5 gap-1.5">
            {['3M', '6M', '12M', '2Y', '5Y'].map(preset => (
              <button
                type="button"
                key={preset}
                onClick={(e) => { e.preventDefault(); handlePresetClick(preset); }}
                disabled={filterOptions.loading}
                className={`min-h-[44px] py-2 text-sm rounded-md border transition-colors ${
                  filterOptions.loading
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
                    : datePreset === preset
                      ? 'bg-[#547792] text-white border-[#547792]'
                      : 'bg-white text-[#213448] border-[#94B4C1] hover:border-[#547792] hover:bg-[#EAE0CF]/50'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          {/* Fallback indicator when using today as anchor (filter options not loaded) */}
          {!filterOptions.dateRange.max && !filterOptions.loading && (
            <div className="text-[10px] text-amber-600 mt-1">
              Using today as anchor (data range loading...)
            </div>
          )}

          {/* Custom indicator when manually edited */}
          {datePreset === 'custom' && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-[#547792] font-medium">Custom range selected</span>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); handlePresetClick('12M'); }}
                className="text-xs text-[#547792] hover:text-[#213448] underline"
              >
                Reset to 12M
              </button>
            </div>
          )}

          {/* Advanced toggle for custom date inputs */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }}
            className="flex items-center gap-1 mt-3 text-xs text-[#547792] hover:text-[#213448] transition-colors"
          >
            <span>Custom dates</span>
            <svg
              className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Custom date inputs (Advanced) */}
          {showAdvanced && (
            <div className="space-y-2 mt-2 pt-2 border-t border-[#94B4C1]/30">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-10">From</span>
                <input
                  type="month"
                  value={filters.dateRange.start ? filters.dateRange.start.substring(0, 7) : ''}
                  onChange={(e) => handleCustomDateChange(e.target.value ? `${e.target.value}-01` : null, filters.dateRange.end)}
                  className="flex-1 px-2 py-2.5 min-h-[44px] text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={filterOptions.dateRange.min ? filterOptions.dateRange.min.substring(0, 7) : undefined}
                  max={filterOptions.dateRange.max ? filterOptions.dateRange.max.substring(0, 7) : undefined}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-10">To</span>
                <input
                  type="month"
                  value={filters.dateRange.end ? filters.dateRange.end.substring(0, 7) : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      // Get last day of the selected month (e.g., Sep has 30, Feb has 28/29)
                      // month from input is 1-based (01-12), day 0 trick gives last day of that month
                      const [year, month] = e.target.value.split('-');
                      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                      handleCustomDateChange(filters.dateRange.start, `${e.target.value}-${String(lastDay).padStart(2, '0')}`);
                    } else {
                      handleCustomDateChange(filters.dateRange.start, null);
                    }
                  }}
                  className="flex-1 px-2 py-2.5 min-h-[44px] text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={filterOptions.dateRange.min ? filterOptions.dateRange.min.substring(0, 7) : undefined}
                  max={filterOptions.dateRange.max ? filterOptions.dateRange.max.substring(0, 7) : undefined}
                />
              </div>
            </div>
          )}

          {/* Data range info */}
          {filterOptions.dateRange.min && filterOptions.dateRange.max && (
            <div className="text-[10px] text-slate-500 mt-2 italic">
              Data: {new Date(filterOptions.dateRange.min).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })} to {new Date(filterOptions.dateRange.max).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
            </div>
          )}
        </FilterSection>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#94B4C1] bg-[#EAE0CF]">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); handleResetFilters(); }}
          disabled={activeFilterCount === 0}
          className={`w-full min-h-[44px] py-2.5 text-sm rounded-md transition-colors ${
            activeFilterCount > 0
              ? 'bg-[#213448] text-white hover:bg-[#547792]'
              : 'bg-[#94B4C1]/30 text-[#547792] cursor-not-allowed'
          }`}
        >
          Reset All Filters
        </button>
      </div>
    </div>
  );
}

// ===== Helper Components =====

function FilterSection({ title, icon, expanded, onToggle, activeCount, children }) {
  return (
    <div className="border-b border-[#94B4C1]/50">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); onToggle(); }}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#94B4C1]/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[#547792]">{icon}</span>
          <span className="font-medium text-[#213448]">{title}</span>
          {activeCount > 0 && (
            <span className="bg-[#547792]/20 text-[#213448] text-xs px-1.5 py-0.5 rounded">
              {activeCount}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-[#547792] transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#547792] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function MultiSelectDropdown({ options, selected, onChange, placeholder, searchable, compact = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = searchable && search
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

  // Get display text - show actual label when only 1 selected
  const getDisplayText = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      const selectedOption = options.find(opt => opt.value === selected[0]);
      return selectedOption?.label || selected[0];
    }
    return `${selected.length} selected`;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (!e.target.closest('.multi-select-dropdown')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);

  return (
    <div className={`relative multi-select-dropdown ${compact ? '' : 'w-full'}`}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className={`${compact ? 'min-w-[140px]' : 'w-full'} px-3 py-2.5 min-h-[44px] text-sm border border-slate-300 rounded-md bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500`}
      >
        <span className={selected.length > 0 ? 'text-slate-800 truncate' : 'text-slate-500'}>
          {getDisplayText()}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className={`absolute z-50 ${compact ? 'w-64' : 'w-full'} mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-hidden`}>
          {searchable && (
            <div className="p-2 border-b border-slate-200">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange([]); }}
                className="w-full px-3 py-2 text-xs text-left text-blue-600 hover:bg-blue-50 border-b border-slate-100"
              >
                Clear selection
              </button>
            )}
            {filteredOptions.map(opt => (
              <label
                key={opt.value}
                className="flex items-center px-3 py-2 hover:bg-slate-50 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={(e) => handleToggle(opt.value, e)}
                  className="mr-2 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PowerBIFilterSidebar;
