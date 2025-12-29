/**
 * DistrictCombobox - Searchable multi-select combobox for districts
 *
 * Features:
 * - Search/filter districts by typing
 * - Multi-select with checkboxes
 * - Shows count when collapsed
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

export function DistrictCombobox() {
  const { filters, filterOptions, toggleDistrict } = usePowerBIFilters();
  const selected = filters.districts || [];
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Get districts from filter options
  const allDistricts = useMemo(() => {
    // filterOptions.districts is [{value, label}, ...]
    if (filterOptions?.districts?.length > 0) {
      return filterOptions.districts;
    }
    // Fallback to districtsRaw if available
    if (filterOptions?.districtsRaw?.length > 0) {
      return filterOptions.districtsRaw.map(d => ({ value: d, label: d }));
    }
    return [];
  }, [filterOptions]);

  // Filter districts by search term
  const filteredDistricts = useMemo(() => {
    if (!searchTerm) return allDistricts;
    const lower = searchTerm.toLowerCase();
    return allDistricts.filter(d =>
      d.value.toLowerCase().includes(lower) ||
      d.label.toLowerCase().includes(lower)
    );
  }, [allDistricts, searchTerm]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Display text
  const displayText = selected.length === 0
    ? 'All Districts'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} districts`;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          min-h-[36px] px-3 py-1.5 rounded-md text-sm font-medium
          flex items-center gap-2
          transition-colors duration-100 select-none
          active:scale-[0.98]
          ${selected.length > 0
            ? 'bg-[#213448] text-white'
            : 'bg-white border border-[#94B4C1] text-[#547792] hover:border-[#547792]'
          }
        `}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate max-w-[100px]">{displayText}</span>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg border border-[#94B4C1]/50 shadow-lg z-50 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-[#94B4C1]/30">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search districts..."
              className="w-full min-h-[36px] px-3 py-2 text-sm border border-[#94B4C1] rounded-md focus:outline-none focus:ring-2 focus:ring-[#547792] focus:border-transparent"
            />
          </div>

          {/* Options list */}
          <div className="max-h-64 overflow-y-auto py-1">
            {filteredDistricts.length === 0 ? (
              <div className="px-3 py-4 text-sm text-[#94B4C1] text-center">
                No districts found
              </div>
            ) : (
              filteredDistricts.map((district) => {
                const isSelected = selected.includes(district.value);
                return (
                  <button
                    key={district.value}
                    onClick={() => toggleDistrict(district.value)}
                    className={`
                      w-full min-h-[40px] px-3 py-2 text-left
                      flex items-center gap-3
                      transition-colors duration-100
                      hover:bg-[#EAE0CF]/30
                      active:bg-[#EAE0CF]/50
                    `}
                  >
                    {/* Checkbox */}
                    <div
                      className={`
                        w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                        transition-colors duration-100
                        ${isSelected
                          ? 'bg-[#213448] border-[#213448]'
                          : 'border-[#94B4C1] bg-white'
                        }
                      `}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm text-[#213448] truncate">{district.label}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Clear selection */}
          {selected.length > 0 && (
            <div className="border-t border-[#94B4C1]/30 p-2">
              <button
                onClick={() => {
                  // Clear all districts by toggling each selected one
                  selected.forEach(d => toggleDistrict(d));
                }}
                className="w-full min-h-[36px] px-3 py-2 text-sm text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF]/30 rounded-md transition-colors"
              >
                Clear selection ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DistrictCombobox;
