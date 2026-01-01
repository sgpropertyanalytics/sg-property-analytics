import React, { useState, useCallback, useEffect } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilter';
import {
  REGIONS,
  DISTRICT_NAMES,
  TIMEFRAME_OPTIONS,
  DEFAULT_TIMEFRAME_ID,
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
    setTimePreset,
    setTimeRange,
    setDistricts,
    setBedroomTypes,
    toggleBedroomType,
    setSegments,
    toggleSegment,
    resetFilters,
  } = usePowerBIFilters();

  // Get time filter state - unified structure
  const timeFilter = filters.timeFilter || { type: 'preset', value: 'Y1' };
  const isPresetMode = timeFilter.type === 'preset';
  const currentPreset = isPresetMode ? timeFilter.value : 'custom';

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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Handle preset button click
  // CLEAN SEMANTIC: Preset mode sends timeframe ID to backend, not dates
  // Backend resolves the actual date bounds. See timeframes.js.
  const handlePresetClick = useCallback((preset) => {
    if (preset === currentPreset) {
      // Clicking same preset clears it (show all data)
      setTimePreset('all');
    } else {
      // Set the preset
      setTimePreset(preset);
    }
  }, [currentPreset, setTimePreset]);

  // Handle custom date changes (when user manually picks dates)
  const handleCustomDateChange = useCallback((start, end) => {
    if (start || end) {
      // Set custom time range
      setTimeRange(start, end);
    } else {
      // No dates = show all
      setTimePreset('all');
    }
  }, [setTimeRange, setTimePreset]);

  // Reset filters handler
  const handleResetFilters = useCallback(() => {
    resetFilters();
    setShowAdvanced(false);
    // resetFilters() resets to INITIAL_FILTERS which has timeFilter: { type: 'preset', value: 'Y1' }
  }, [resetFilters]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // ==================== HORIZONTAL LAYOUT ====================
  // iOS-style segmented controls with pill-shaped tracks
  // Frosted glass - sticky handled by parent FilterBar wrapper
  // Single row layout: Property filters | Time Duration | Granularity | Reset
  if (layout === 'horizontal') {
    return (
      <div className="-mx-3 md:-mx-4 lg:-mx-6 px-3 md:px-4 lg:px-6 py-3 bg-[#EAE0CF]/70 backdrop-blur-md border-b border-[#94B4C1]/30 shadow-sm">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-start gap-3">
          {/* Property Filters - Region + District + Bedroom */}
          <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
            {/* Region Segmented Track */}
            <div className="inline-flex bg-white/60 backdrop-blur-sm border border-gray-300/80 rounded-xl shadow-sm overflow-hidden divide-x divide-gray-200/80">
              {/* "All" button - dark blue when active (default state) */}
              <button
                type="button"
                onClick={() => setSegments([])}
                className={`px-4 py-2 text-sm font-medium transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213448] focus-visible:ring-inset ${
                  filters.segments.length === 0
                    ? 'bg-[#213448] text-white shadow-inner'
                    : 'bg-transparent text-slate-500 hover:bg-white/50 hover:text-slate-900'
                }`}
              >
                All
              </button>
              {REGIONS.map(seg => (
                <button
                  type="button"
                  key={seg}
                  onClick={(e) => handleFilterClick(e, seg, filters.segments, setSegments, toggleSegment)}
                  className={`px-4 py-2 text-sm font-medium transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213448] focus-visible:ring-inset ${
                    filters.segments.includes(seg)
                      ? 'bg-[#213448] text-white shadow-inner'
                      : 'bg-transparent text-slate-500 hover:bg-white/50 hover:text-slate-900'
                  }`}
                  title="Shift+click to multi-select"
                >
                  {seg}
                </button>
              ))}
            </div>

            {/* District Dropdown - pill-shaped to match tracks */}
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
              segmentedStyle
            />

            {/* Bedroom Segmented Track */}
            <div className="inline-flex bg-white/60 backdrop-blur-sm border border-gray-300/80 rounded-xl shadow-sm overflow-hidden divide-x divide-gray-200/80">
              {/* "All" button - dark blue when active */}
              <button
                type="button"
                onClick={() => setBedroomTypes([])}
                className={`px-3 py-2 text-sm font-medium transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213448] focus-visible:ring-inset ${
                  filters.bedroomTypes.length === 0
                    ? 'bg-[#213448] text-white shadow-inner'
                    : 'bg-transparent text-slate-500 hover:bg-white/50 hover:text-slate-900'
                }`}
              >
                All
              </button>
              {[1, 2, 3, 4, 5].map(br => (
                <button
                  type="button"
                  key={br}
                  onClick={(e) => handleFilterClick(e, br, filters.bedroomTypes, setBedroomTypes, toggleBedroomType)}
                  className={`px-3 py-2 text-sm font-medium transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213448] focus-visible:ring-inset ${
                    filters.bedroomTypes.includes(br)
                      ? 'bg-[#213448] text-white shadow-inner'
                      : 'bg-transparent text-slate-500 hover:bg-white/50 hover:text-slate-900'
                  }`}
                  title="Shift+click to multi-select"
                >
                  {br === 5 ? '5BR' : `${br}BR`}
                </button>
              ))}
            </div>
          </div>

          {/* Divider - visible on large screens */}
          <div className="hidden lg:block w-px h-7 bg-[#94B4C1]/50 flex-shrink-0" />

          {/* Time Controls - Period Presets */}
          <div className="inline-flex bg-white/60 backdrop-blur-sm border border-gray-300/80 rounded-xl shadow-sm overflow-hidden divide-x divide-gray-200/80 flex-shrink-0">
            {TIMEFRAME_OPTIONS.map(opt => (
              <button
                type="button"
                key={opt.id}
                onClick={(e) => { e.preventDefault(); handlePresetClick(opt.id); }}
                disabled={filterOptions.loading}
                className={`px-3 py-2 text-sm font-medium transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213448] focus-visible:ring-inset ${
                  filterOptions.loading
                    ? 'bg-gray-100/80 text-gray-400 cursor-wait'
                    : currentPreset === opt.id
                      ? 'bg-[#213448] text-white shadow-inner'
                      : 'bg-transparent text-slate-500 hover:bg-white/50 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Divider - visible on large screens */}
          <div className="hidden lg:block w-px h-7 bg-[#94B4C1]/50 flex-shrink-0" />

          {/* Time Granularity Toggle */}
          <TimeGranularityToggle layout="horizontal" />

          {/* Reset button - text link style, always at end */}
          {activeFilterCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="min-h-[44px] px-3 py-2 text-sm font-medium text-[#547792] hover:text-[#213448] hover:underline transition-colors flex-shrink-0 ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213448] focus-visible:ring-offset-2 rounded"
            >
              Reset
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
        {/* Header - with iOS safe area for notched devices */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-[#94B4C1]/30" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
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
                  {br === 5 ? '5BR' : `${br}BR`}
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
            activeCount={(timeFilter.type === 'custom' && (timeFilter.start || timeFilter.end)) || (timeFilter.type === 'preset' && timeFilter.value !== 'Y1') ? 1 : 0}
          >
            <div className="grid grid-cols-5 gap-1.5">
              {TIMEFRAME_OPTIONS.map(opt => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={(e) => { e.preventDefault(); handlePresetClick(opt.id); }}
                  disabled={filterOptions.loading}
                  className={`min-h-[44px] py-2 text-sm rounded-md border transition-colors ${
                    filterOptions.loading
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
                      : currentPreset === opt.id
                        ? 'bg-[#547792] text-white border-[#547792]'
                        : 'bg-white text-[#213448] border-[#94B4C1] hover:border-[#547792] hover:bg-[#EAE0CF]/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {!filterOptions.dateRange.max && !filterOptions.loading && (
              <div className="text-[10px] text-amber-600 mt-1">
                Using today as anchor (data range loading...)
              </div>
            )}
            {currentPreset === 'custom' && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-[#547792] font-medium">Custom range selected</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePresetClick(DEFAULT_TIMEFRAME_ID); }}
                  className="text-xs text-[#547792] hover:text-[#213448] underline"
                >
                  Reset to 1Y
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
                    value={timeFilter.start ? timeFilter.start.substring(0, 7) : ''}
                    onChange={(e) => handleCustomDateChange(e.target.value ? `${e.target.value}-01` : null, timeFilter.end)}
                    className="flex-1 px-2 py-2.5 min-h-[44px] text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={filterOptions.dateRange.min ? filterOptions.dateRange.min.substring(0, 7) : undefined}
                    max={filterOptions.dateRange.max ? filterOptions.dateRange.max.substring(0, 7) : undefined}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-10">To</span>
                  <input
                    type="month"
                    value={timeFilter.end ? timeFilter.end.substring(0, 7) : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [year, month] = e.target.value.split('-');
                        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                        handleCustomDateChange(timeFilter.start, `${e.target.value}-${String(lastDay).padStart(2, '0')}`);
                      } else {
                        handleCustomDateChange(timeFilter.start, null);
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
                Reset
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
            Reset
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
                {br === 5 ? '5BR' : `${br}BR`}
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
          activeCount={(timeFilter.type === 'custom' && (timeFilter.start || timeFilter.end)) || (timeFilter.type === 'preset' && timeFilter.value !== 'Y1') ? 1 : 0}
        >
          {/* Preset Buttons - Primary interaction */}
          {/* Shows loading indicator when filter options not ready, buttons still work with fallback to today */}
          <div className="grid grid-cols-5 gap-1.5">
            {TIMEFRAME_OPTIONS.map(opt => (
              <button
                type="button"
                key={opt.id}
                onClick={(e) => { e.preventDefault(); handlePresetClick(opt.id); }}
                disabled={filterOptions.loading}
                className={`min-h-[44px] py-2 text-sm rounded-md border transition-colors ${
                  filterOptions.loading
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
                    : currentPreset === opt.id
                      ? 'bg-[#547792] text-white border-[#547792]'
                      : 'bg-white text-[#213448] border-[#94B4C1] hover:border-[#547792] hover:bg-[#EAE0CF]/50'
                }`}
              >
                {opt.label}
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
          {currentPreset === 'custom' && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-[#547792] font-medium">Custom range selected</span>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); handlePresetClick(DEFAULT_TIMEFRAME_ID); }}
                className="text-xs text-[#547792] hover:text-[#213448] underline"
              >
                Reset to 1Y
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
                  value={timeFilter.start ? timeFilter.start.substring(0, 7) : ''}
                  onChange={(e) => handleCustomDateChange(e.target.value ? `${e.target.value}-01` : null, timeFilter.end)}
                  className="flex-1 px-2 py-2.5 min-h-[44px] text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={filterOptions.dateRange.min ? filterOptions.dateRange.min.substring(0, 7) : undefined}
                  max={filterOptions.dateRange.max ? filterOptions.dateRange.max.substring(0, 7) : undefined}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-10">To</span>
                <input
                  type="month"
                  value={timeFilter.end ? timeFilter.end.substring(0, 7) : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      // Get last day of the selected month (e.g., Sep has 30, Feb has 28/29)
                      // month from input is 1-based (01-12), day 0 trick gives last day of that month
                      const [year, month] = e.target.value.split('-');
                      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                      handleCustomDateChange(timeFilter.start, `${e.target.value}-${String(lastDay).padStart(2, '0')}`);
                    } else {
                      handleCustomDateChange(timeFilter.start, null);
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

function MultiSelectDropdown({ options, selected, onChange, placeholder, searchable, compact = false, segmentedStyle = false }) {
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

  // Styles differ based on segmentedStyle prop
  const buttonClasses = segmentedStyle
    ? `${compact ? 'min-w-[140px]' : 'w-full'} min-w-0 px-3 py-2 min-h-[44px] text-sm font-medium border border-gray-300/80 rounded-lg bg-white/60 backdrop-blur-sm text-left flex items-center justify-between shadow-sm focus:outline-none focus:ring-2 focus:ring-[#213448]`
    : `${compact ? 'min-w-[140px]' : 'w-full'} min-w-0 px-3 py-2.5 min-h-[44px] text-sm border border-slate-300 rounded-md bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500`;

  const dropdownClasses = segmentedStyle
    ? `absolute z-50 ${compact ? 'w-64' : 'w-full'} mt-1 bg-white/95 backdrop-blur-sm border border-gray-300/80 rounded-lg shadow-lg max-h-60 overflow-hidden`
    : `absolute z-50 ${compact ? 'w-64' : 'w-full'} mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-hidden`;

  return (
    <div className={`relative multi-select-dropdown ${compact ? '' : 'w-full'}`}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className={buttonClasses}
      >
        <span className={`${selected.length > 0 ? 'text-slate-900' : 'text-slate-500'} truncate min-w-0 flex-shrink`}>
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
        <div className={dropdownClasses}>
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
