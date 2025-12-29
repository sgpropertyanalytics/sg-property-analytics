import React from 'react';

/**
 * MapMetricToggle - Floating toggle for map metric selection
 *
 * Controls what metric the map uses for coloring:
 * - Price: Districts colored by median PSF
 * - Volume: Districts colored by transaction count
 * - Supply: Districts colored by unsold inventory
 *
 * Positioned floating over the map (top-right).
 */
export function MapMetricToggle({ metric, onMetricChange, className = '' }) {
  const options = [
    { value: 'price', label: 'Price', icon: '💲' },
    { value: 'volume', label: 'Volume', icon: '📊' },
    { value: 'supply', label: 'Supply', icon: '⚠️' },
  ];

  return (
    <div className={`${className}`}>
      {/* Floating container with backdrop blur */}
      <div className="bg-white/95 backdrop-blur-sm rounded-lg border border-[#94B4C1]/50 shadow-lg p-1">
        <div className="inline-flex rounded-md">
          {options.map((opt, index) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onMetricChange(opt.value)}
              className={`
                px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium
                transition-all duration-200 flex items-center gap-1
                ${index === 0 ? 'rounded-l-md' : ''}
                ${index === options.length - 1 ? 'rounded-r-md' : ''}
                ${metric === opt.value
                  ? 'bg-[#213448] text-white shadow-sm'
                  : 'bg-white text-[#547792] hover:bg-[#94B4C1]/20'
                }
              `}
            >
              <span>{opt.icon}</span>
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MapMetricToggle;
