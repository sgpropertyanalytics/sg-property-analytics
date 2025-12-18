import React, { useState } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { DISTRICT_NAMES } from '../../constants';

/**
 * Power BI-style Filter Sidebar
 *
 * Contains dropdown/multi-select filters for all dimensions.
 * Defaults all filters to 'All' (no restriction).
 */
export function PowerBIFilterSidebar({ collapsed = false, onToggle }) {
  const {
    filters,
    filterOptions,
    crossFilter,
    activeFilterCount,
    setDateRange,
    setDistricts,
    toggleDistrict,
    setBedroomTypes,
    toggleBedroomType,
    setSegment,
    setSaleType,
    setPsfRange,
    setSizeRange,
    setTenure,
    resetFilters,
    clearCrossFilter,
  } = usePowerBIFilters();

  const [expandedSections, setExpandedSections] = useState({
    location: true,
    date: true,
    roomSize: true,
    other: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (collapsed) {
    return (
      <div className="w-12 bg-[#EAE0CF] border-r border-[#94B4C1] flex flex-col items-center py-4">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onToggle(); }}
          className="p-2 rounded-lg hover:bg-[#94B4C1]/30 transition-colors"
          title="Expand filters"
        >
          <svg className="w-5 h-5 text-[#213448]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>
        {activeFilterCount > 0 && (
          <span className="mt-2 bg-[#547792] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-72 bg-[#EAE0CF] border-r border-[#94B4C1] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1] flex items-center justify-between bg-[#213448]">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#94B4C1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="font-semibold text-white">Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-[#547792] text-white text-xs px-2 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); resetFilters(); }}
              className="text-xs text-[#94B4C1] hover:text-white px-2 py-1 rounded hover:bg-[#547792]/30"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onToggle(); }}
            className="p-1.5 rounded hover:bg-[#547792]/30 transition-colors"
            title="Collapse filters"
          >
            <svg className="w-4 h-4 text-[#94B4C1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Cross-filter indicator */}
      {crossFilter.value && (
        <div className="px-4 py-2 bg-[#547792]/20 border-b border-[#547792]/30 flex items-center justify-between">
          <div className="text-xs">
            <span className="text-[#547792]">Cross-filter: </span>
            <span className="font-medium text-[#213448]">{crossFilter.value}</span>
          </div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); clearCrossFilter(); }}
            className="text-[#547792] hover:text-[#213448] p-1"
            title="Clear selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Filter sections */}
      <div className="flex-1 overflow-y-auto">
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
            (filters.segment ? 1 : 0) +
            (filters.districts.length > 0 ? 1 : 0)
          }
        >
          {/* Market Segment */}
          <FilterGroup label="Market Segment">
            <select
              value={filters.segment || ''}
              onChange={(e) => setSegment(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Segments</option>
              <option value="CCR">CCR (Core Central)</option>
              <option value="RCR">RCR (Rest of Central)</option>
              <option value="OCR">OCR (Outside Central)</option>
            </select>
          </FilterGroup>

          {/* Districts Multi-select */}
          <FilterGroup label="Districts">
            <MultiSelectDropdown
              options={filterOptions.districts.map(d => {
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
          <FilterGroup label="Date Range">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-10">From</span>
                <input
                  type="month"
                  value={filters.dateRange.start ? filters.dateRange.start.substring(0, 7) : ''}
                  onChange={(e) => setDateRange(e.target.value ? `${e.target.value}-01` : null, filters.dateRange.end)}
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={filterOptions.dateRange.min ? filterOptions.dateRange.min.substring(0, 7) : undefined}
                  max={filterOptions.dateRange.max ? filterOptions.dateRange.max.substring(0, 7) : undefined}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-10">To</span>
                <input
                  type="month"
                  value={filters.dateRange.end ? filters.dateRange.end.substring(0, 7) : ''}
                  onChange={(e) => setDateRange(filters.dateRange.start, e.target.value ? `${e.target.value}-01` : null)}
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={filterOptions.dateRange.min ? filterOptions.dateRange.min.substring(0, 7) : undefined}
                  max={filterOptions.dateRange.max ? filterOptions.dateRange.max.substring(0, 7) : undefined}
                />
              </div>
            </div>
            {filterOptions.dateRange.min && filterOptions.dateRange.max && (
              <div className="text-xs text-slate-500 mt-2">
                Data: {new Date(filterOptions.dateRange.min).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })} to {new Date(filterOptions.dateRange.max).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
              </div>
            )}
          </FilterGroup>
        </FilterSection>

        {/* Room Size Section */}
        <FilterSection
          title="Room Size"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
          expanded={expandedSections.roomSize}
          onToggle={() => toggleSection('roomSize')}
          activeCount={
            (filters.bedroomTypes.length > 0 ? 1 : 0) +
            (filters.sizeRange.min !== null || filters.sizeRange.max !== null ? 1 : 0)
          }
        >
          {/* Bedroom Type Pills */}
          <FilterGroup label="Bedrooms">
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map(br => (
                <button
                  type="button"
                  key={br}
                  onClick={(e) => { e.preventDefault(); toggleBedroomType(br); }}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    filters.bedroomTypes.includes(br)
                      ? 'bg-[#547792] text-white border-[#547792]'
                      : filters.bedroomTypes.length === 0
                        ? 'bg-white text-[#213448] border-[#94B4C1]'
                        : 'bg-white text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                  }`}
                >
                  {br === 5 ? '5+' : br} BR
                </button>
              ))}
            </div>
            <div className="text-xs text-[#547792] mt-1">
              {filters.bedroomTypes.length === 0 ? 'Default: 2-4 BR' : `${filters.bedroomTypes.length} selected`}
            </div>
          </FilterGroup>

          {/* Size Range Slider */}
          <FilterGroup label="Unit Size (sqft)">
            <RangeSlider
              min={filterOptions.sizeRange.min || 0}
              max={filterOptions.sizeRange.max || 5000}
              value={[filters.sizeRange.min, filters.sizeRange.max]}
              onChange={(min, max) => setSizeRange(min, max)}
              step={50}
              formatValue={(v) => v?.toLocaleString() || 'Any'}
            />
          </FilterGroup>
        </FilterSection>

        {/* Other Filters Section */}
        <FilterSection
          title="Other Filters"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          }
          expanded={expandedSections.other}
          onToggle={() => toggleSection('other')}
          activeCount={
            (filters.saleType ? 1 : 0) +
            (filters.tenure ? 1 : 0) +
            (filters.psfRange.min !== null || filters.psfRange.max !== null ? 1 : 0)
          }
        >
          {/* Sale Type */}
          <FilterGroup label="Sale Type">
            <select
              value={filters.saleType || ''}
              onChange={(e) => setSaleType(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Types</option>
              <option value="New Sale">New Sale</option>
              <option value="Resale">Resale</option>
            </select>
          </FilterGroup>

          {/* Tenure */}
          <FilterGroup label="Tenure">
            <select
              value={filters.tenure || ''}
              onChange={(e) => setTenure(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Tenures</option>
              <option value="Freehold">Freehold</option>
              <option value="999-year">999-year</option>
              <option value="99-year">99-year Leasehold</option>
            </select>
          </FilterGroup>

          {/* PSF Range */}
          <FilterGroup label="PSF Range ($)">
            <RangeSlider
              min={filterOptions.psfRange.min || 0}
              max={filterOptions.psfRange.max || 5000}
              value={[filters.psfRange.min, filters.psfRange.max]}
              onChange={(min, max) => setPsfRange(min, max)}
              step={100}
              formatValue={(v) => v ? `$${v.toLocaleString()}` : 'Any'}
            />
          </FilterGroup>
        </FilterSection>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#94B4C1] bg-[#EAE0CF]">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); resetFilters(); }}
          disabled={activeFilterCount === 0}
          className={`w-full py-2 text-sm rounded-md transition-colors ${
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
      <label className="block text-xs font-medium text-[#547792] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function MultiSelectDropdown({ options, selected, onChange, placeholder, searchable }) {
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={selected.length > 0 ? 'text-slate-800' : 'text-slate-500'}>
          {selected.length > 0 ? `${selected.length} selected` : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-slate-200">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
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

function RangeSlider({ min, max, value, onChange, step = 1, formatValue }) {
  const [localMin, localMax] = value;

  const handleMinChange = (e) => {
    const newMin = e.target.value ? parseFloat(e.target.value) : null;
    onChange(newMin, localMax);
  };

  const handleMaxChange = (e) => {
    const newMax = e.target.value ? parseFloat(e.target.value) : null;
    onChange(localMin, newMax);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="number"
          value={localMin ?? ''}
          onChange={handleMinChange}
          placeholder="Min"
          min={min}
          max={max}
          step={step}
          className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-slate-400 self-center">-</span>
        <input
          type="number"
          value={localMax ?? ''}
          onChange={handleMaxChange}
          placeholder="Max"
          min={min}
          max={max}
          step={step}
          className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="text-xs text-slate-500 flex justify-between">
        <span>{formatValue(localMin)}</span>
        <span>to</span>
        <span>{formatValue(localMax)}</span>
      </div>
    </div>
  );
}

export default PowerBIFilterSidebar;
