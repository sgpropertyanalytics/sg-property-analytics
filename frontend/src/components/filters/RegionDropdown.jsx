/**
 * RegionDropdown - Multi-select dropdown for CCR/RCR/OCR
 *
 * Compact dropdown that shows selected regions or "All Regions".
 * Uses checkboxes for multi-selection.
 */

import { useState, useRef, useEffect } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

const REGION_OPTIONS = [
  { value: 'CCR', label: 'CCR', description: 'Core Central Region' },
  { value: 'RCR', label: 'RCR', description: 'Rest of Central Region' },
  { value: 'OCR', label: 'OCR', description: 'Outside Central Region' },
];

export function RegionDropdown() {
  const { filters, toggleSegment } = usePowerBIFilters();
  const selected = filters.segments || [];
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

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

  // Display text
  const displayText = selected.length === 0
    ? 'All Regions'
    : selected.length === 3
      ? 'All Regions'
      : selected.join(', ');

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          min-h-[36px] px-3 py-1.5 rounded-md text-sm font-medium
          flex items-center gap-2
          transition-colors duration-100 select-none
          active:scale-[0.98]
          ${selected.length > 0 && selected.length < 3
            ? 'bg-[#213448] text-white'
            : 'bg-white border border-[#94B4C1] text-[#547792] hover:border-[#547792]'
          }
        `}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate max-w-[120px]">{displayText}</span>
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
        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg border border-[#94B4C1]/50 shadow-lg z-50 py-1">
          {REGION_OPTIONS.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => toggleSegment(option.value)}
                className={`
                  w-full min-h-[44px] px-3 py-2 text-left
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
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#213448]">{option.label}</div>
                  <div className="text-xs text-[#547792]">{option.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RegionDropdown;
