/**
 * DateRangePicker - Date range input with presets panel
 *
 * Features:
 * - Quick presets: 3M, 12M, 2Y, 5Y
 * - Dropdown for presets
 * - Shows selected range in compact format
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

// Calculate date from preset
function getPresetDates(preset, maxDate) {
  const end = maxDate || new Date();
  const start = new Date(end);

  switch (preset) {
    case '3M':
      start.setMonth(start.getMonth() - 3);
      break;
    case '12M':
      start.setMonth(start.getMonth() - 12);
      break;
    case '2Y':
      start.setFullYear(start.getFullYear() - 2);
      break;
    case '5Y':
      start.setFullYear(start.getFullYear() - 5);
      break;
    case 'ALL':
    default:
      return { start: null, end: null };
  }

  return { start, end };
}

// Format date for display
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Determine which preset matches current date range
function getActivePreset(dateRange, maxDate) {
  if (!dateRange?.start && !dateRange?.end) return 'ALL';

  const end = maxDate || new Date();
  const start = new Date(dateRange.start);

  // Calculate months difference
  const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

  if (monthsDiff <= 3) return '3M';
  if (monthsDiff <= 12) return '12M';
  if (monthsDiff <= 24) return '2Y';
  if (monthsDiff <= 60) return '5Y';
  return 'ALL';
}

const PRESETS = [
  { value: '3M', label: '3 Months' },
  { value: '12M', label: '12 Months' },
  { value: '2Y', label: '2 Years' },
  { value: '5Y', label: '5 Years' },
  { value: 'ALL', label: 'All Time' },
];

export function DateRangePicker() {
  const { filters, filterOptions, setDateRange } = usePowerBIFilters();

  // Memoize to stabilize references for downstream useMemo hooks
  const dateRange = useMemo(
    () => filters.dateRange || { start: null, end: null },
    [filters.dateRange]
  );
  const maxDate = useMemo(
    () => filterOptions?.dateRange?.max ? new Date(filterOptions.dateRange.max) : new Date(),
    [filterOptions?.dateRange?.max]
  );

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activePreset = useMemo(
    () => getActivePreset(dateRange, maxDate),
    [dateRange, maxDate]
  );

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePresetClick = (preset) => {
    const { start, end } = getPresetDates(preset, maxDate);
    setDateRange(start, end);
    setIsOpen(false);
  };

  // Display text
  const displayText = useMemo(() => {
    if (!dateRange?.start && !dateRange?.end) {
      return 'All Time';
    }
    const preset = PRESETS.find(p => p.value === activePreset);
    if (preset && preset.value !== 'ALL') {
      return preset.label;
    }
    const startStr = formatDate(dateRange.start);
    const endStr = formatDate(dateRange.end);
    if (startStr && endStr) {
      return `${startStr} - ${endStr}`;
    }
    return 'All Time';
  }, [dateRange, activePreset]);

  const hasFilter = dateRange?.start || dateRange?.end;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          min-h-[36px] px-3 py-1.5 rounded-md text-sm font-medium
          flex items-center gap-2
          transition-colors duration-100 select-none
          active:scale-[0.98]
          ${hasFilter
            ? 'bg-[#213448] text-white'
            : 'bg-white border border-[#94B4C1] text-[#547792] hover:border-[#547792]'
          }
        `}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {/* Calendar icon */}
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
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
        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg border border-[#94B4C1]/50 shadow-lg z-50 py-1">
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset.value;
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
  );
}

export default DateRangePicker;
