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
    resetFilters,
    clearCrossFilter,
  } = usePowerBIFilters();

  const [expandedSections, setExpandedSections] = useState({
    location: true,
    date: true,
    roomSize: true,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

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
    <div className="w-full sm:w-72 bg-[#EAE0CF] border-r border-[#94B4C1]/30 flex flex-col h-full overflow-hidden">
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
            onClick={(e) => { e.preventDefault(); resetFilters(); }}
            className="text-xs text-[#547792] hover:text-[#213448] px-2 py-1 rounded hover:bg-[#94B4C1]/30 transition-colors"
          >
            Clear all
          </button>
        )}
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
          {/* Market Segment Buttons */}
          <FilterGroup label="Market Segment">
            <div className="grid grid-cols-3 gap-2">
              {['CCR', 'RCR', 'OCR'].map(seg => (
                <button
                  type="button"
                  key={seg}
                  onClick={(e) => { e.preventDefault(); setSegment(filters.segment === seg ? null : seg); }}
                  className={`py-2 text-sm rounded-md border transition-colors ${
                    filters.segment === seg
                      ? 'bg-[#547792] text-white border-[#547792]'
                      : 'bg-white text-[#213448] border-[#94B4C1] hover:border-[#547792]'
                  }`}
                >
                  {seg}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2 font-normal">
              CCR/RCR/OCR follows market convention; select areas may differ at planning-area level.
            </p>
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
          activeCount={
            (filters.bedroomTypes.length > 0 ? 1 : 0) +
            (filters.saleType ? 1 : 0)
          }
        >
          {/* Bedroom Type Buttons - centered with consistent width */}
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map(br => (
              <button
                type="button"
                key={br}
                onClick={(e) => { e.preventDefault(); toggleBedroomType(br); }}
                className={`py-2 text-sm rounded-md border transition-colors ${
                  filters.bedroomTypes.includes(br)
                    ? 'bg-[#547792] text-white border-[#547792]'
                    : filters.bedroomTypes.length === 0
                      ? 'bg-white text-[#213448] border-[#94B4C1]'
                      : 'bg-white text-[#547792] border-[#94B4C1] hover:border-[#547792]'
                }`}
              >
                {br === 4 ? '4B+' : `${br}B`}
              </button>
            ))}
          </div>

          {/* Sale Type Buttons */}
          <FilterGroup label="Sale Type">
            <div className="grid grid-cols-2 gap-2">
              {[{ value: 'New Sale', label: 'New Sale' }, { value: 'Resale', label: 'Resale' }].map(type => (
                <button
                  type="button"
                  key={type.value}
                  onClick={(e) => { e.preventDefault(); setSaleType(filters.saleType === type.value ? null : type.value); }}
                  className={`py-2 text-sm rounded-md border transition-colors ${
                    filters.saleType === type.value
                      ? 'bg-[#547792] text-white border-[#547792]'
                      : 'bg-white text-[#213448] border-[#94B4C1] hover:border-[#547792]'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </FilterGroup>

          {/* Classification Tiers Info */}
          <div className="text-xs text-slate-500 mt-2 space-y-1.5">
            <div className="font-normal text-slate-500">Bedroom Classification (sqft):</div>
            <table className="w-full text-[10px] border-collapse border border-dotted border-slate-400">
              <thead>
                <tr className="text-slate-600 bg-slate-50/50">
                  <th className="text-left font-medium p-1.5 border border-dotted border-slate-400">Type</th>
                  <th className="text-center font-medium p-1.5 border border-dotted border-slate-400">1B</th>
                  <th className="text-center font-medium p-1.5 border border-dotted border-slate-400">2B</th>
                  <th className="text-center font-medium p-1.5 border border-dotted border-slate-400">3B</th>
                  <th className="text-center font-medium p-1.5 border border-dotted border-slate-400">4B+</th>
                </tr>
              </thead>
              <tbody className="text-slate-500">
                <tr title="Post-harmonization: AC ledge rules changed">
                  <td className="text-left p-1.5 border border-dotted border-slate-400">New ≥Jun'23</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">&lt;580</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">&lt;780</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">&lt;1150</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">≥1150</td>
                </tr>
                <tr title="Pre-harmonization: Before AC ledge rule changes">
                  <td className="text-left p-1.5 border border-dotted border-slate-400">New &lt;Jun'23</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">&lt;600</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">&lt;850</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">&lt;1200</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">≥1200</td>
                </tr>
                <tr title="Resale units: Legacy larger sizes">
                  <td className="text-left p-1.5 border border-dotted border-slate-400">Resale</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">&lt;600</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">&lt;950</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">&lt;1350</td>
                  <td className="text-center p-1.5 border border-dotted border-slate-400">≥1350</td>
                </tr>
              </tbody>
            </table>
            <div className="text-xs text-slate-500 font-normal mt-1">
              Post-harm: after AC ledge removal | Pre-harm: before
            </div>
          </div>
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
                  onChange={(e) => {
                    if (e.target.value) {
                      // Get last day of the selected month (e.g., Sep has 30, Feb has 28/29)
                      // month from input is 1-based (01-12), day 0 trick gives last day of that month
                      const [year, month] = e.target.value.split('-');
                      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                      setDateRange(filters.dateRange.start, `${e.target.value}-${String(lastDay).padStart(2, '0')}`);
                    } else {
                      setDateRange(filters.dateRange.start, null);
                    }
                  }}
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={filterOptions.dateRange.min ? filterOptions.dateRange.min.substring(0, 7) : undefined}
                  max={filterOptions.dateRange.max ? filterOptions.dateRange.max.substring(0, 7) : undefined}
                />
              </div>
            </div>
            {filterOptions.dateRange.min && filterOptions.dateRange.max && (
              <div className="text-xs text-slate-500 mt-2 font-normal">
                Data: {new Date(filterOptions.dateRange.min).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })} to {new Date(filterOptions.dateRange.max).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
              </div>
            )}
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

  // Get display text - show actual label when only 1 selected
  const getDisplayText = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      const selectedOption = options.find(opt => opt.value === selected[0]);
      return selectedOption?.label || selected[0];
    }
    return `${selected.length} selected`;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
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

function RangeSlider({ min, max, value, onChange, step = 1 }) {
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
    </div>
  );
}

export default PowerBIFilterSidebar;
