import React from 'react';

/**
 * ViewModeToggle - Switch between Market Pulse and District Atlas views
 *
 * This is a VIEW MODE control (not a filter):
 * - Market Pulse: Time-series charts, trends, momentum
 * - District Atlas: Spatial analysis, maps, inventory
 *
 * Features:
 * - Segmented control matching TimeGranularityToggle style
 * - No localStorage persistence (always starts on 'pulse')
 * - Controlled component - state owned by parent
 */
export function ViewModeToggle({ viewMode, onViewModeChange, className = '' }) {
  const options = [
    { value: 'pulse', label: 'Market Pulse', icon: '📈' },
    { value: 'atlas', label: 'District Atlas', icon: '🗺️' },
  ];

  return (
    <div className={`flex items-center ${className}`}>
      {/* Label - hidden on very small screens */}
      <span className="hidden sm:inline text-xs text-[#547792] font-medium mr-2 whitespace-nowrap">
        View:
      </span>

      {/* Segmented toggle - more compact on mobile */}
      <div className="inline-flex rounded-lg bg-[#94B4C1]/20 p-0.5 sm:p-1">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onViewModeChange(opt.value)}
            className={`
              px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md
              transition-all duration-200 flex items-center gap-1
              ${viewMode === opt.value
                ? 'bg-[#213448] text-white shadow-sm'
                : 'text-[#547792] hover:text-[#213448] hover:bg-[#94B4C1]/20'
              }
            `}
          >
            <span className="hidden sm:inline">{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ViewModeToggle;
