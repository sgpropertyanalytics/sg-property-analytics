import React, { useState, useEffect } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

/**
 * TimeGranularityToggle - Global time grouping control
 *
 * This is a VIEW CONTEXT control, not a filter:
 * - Filters (sidebar): "Show me only D01 condos" - restricts data
 * - View Context (toolbar): "Show me yearly data" - changes how data is displayed
 *
 * Features:
 * - Segmented control: Year | Quarter | Month
 * - Persists user preference to localStorage
 * - One-time helper tooltip (auto-dismisses after 5s)
 * - Controls all time-series charts simultaneously
 */
export function TimeGranularityToggle({ className = '' }) {
  const { timeGrouping, setTimeGrouping } = usePowerBIFilters();
  const [showHelper, setShowHelper] = useState(false);

  const options = [
    { value: 'year', label: 'Year' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'month', label: 'Month' },
  ];

  // Show helper on mount (first time only), auto-dismiss after 5s
  useEffect(() => {
    const seen = localStorage.getItem('hasSeenTimeGroupingHelper');
    if (!seen) {
      setShowHelper(true);
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        localStorage.setItem('hasSeenTimeGroupingHelper', 'true');
        setShowHelper(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Dismiss helper on any interaction
  const dismissHelper = () => {
    if (showHelper) {
      localStorage.setItem('hasSeenTimeGroupingHelper', 'true');
      setShowHelper(false);
    }
  };

  const handleChange = (value) => {
    dismissHelper();
    setTimeGrouping(value);
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      {/* Label */}
      <span className="text-xs text-[#547792] font-medium mr-2 whitespace-nowrap">
        Group by:
      </span>

      {/* Segmented toggle */}
      <div className="inline-flex rounded-lg bg-[#94B4C1]/20 p-1">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleChange(opt.value)}
            className={`
              px-3 py-1.5 text-xs font-medium rounded-md
              transition-all duration-200
              ${timeGrouping === opt.value
                ? 'bg-[#213448] text-white shadow-sm'
                : 'text-[#547792] hover:text-[#213448] hover:bg-[#94B4C1]/20'
              }
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* One-time helper tooltip - auto-dismisses after 5s */}
      {showHelper && (
        <div
          className="absolute left-0 top-full mt-2 p-2.5 bg-[#213448] text-white text-xs rounded-lg shadow-lg z-50 w-56"
          style={{ animation: 'fadeIn 0.2s ease-out' }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="leading-relaxed">
              This applies to all time-series charts on this page
            </span>
            <button
              type="button"
              onClick={dismissHelper}
              className="text-[#94B4C1] hover:text-white transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Arrow pointing up */}
          <div className="absolute -top-1.5 left-4 w-3 h-3 bg-[#213448] transform rotate-45" />
        </div>
      )}

      {/* CSS animation for tooltip */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default TimeGranularityToggle;
