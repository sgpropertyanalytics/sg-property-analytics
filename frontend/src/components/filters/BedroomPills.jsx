/**
 * BedroomPills - Pill/segment control for bedroom selection
 *
 * Displays bedroom options as toggleable pills.
 * All options visible (only 5), touch-friendly.
 */

import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

const BEDROOM_OPTIONS = [
  { value: 1, label: '1BR' },
  { value: 2, label: '2BR' },
  { value: 3, label: '3BR' },
  { value: 4, label: '4BR' },
  { value: 5, label: '5BR+' },
];

export function BedroomPills() {
  const { filters, toggleBedroomType } = usePowerBIFilters();
  const selected = filters.bedroomTypes || [];

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-[#547792] mr-1 hidden sm:inline">Size</span>
      <div className="flex gap-1">
        {BEDROOM_OPTIONS.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              onClick={() => toggleBedroomType(option.value)}
              className={`
                min-h-[36px] min-w-[44px] px-2.5 py-1.5 rounded-md text-xs font-medium
                transition-colors duration-100 select-none
                active:scale-[0.98]
                ${isSelected
                  ? 'bg-[#213448] text-white'
                  : 'bg-white border border-[#94B4C1] text-[#547792] hover:border-[#547792] hover:text-[#213448]'
                }
              `}
              aria-pressed={isSelected}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BedroomPills;
