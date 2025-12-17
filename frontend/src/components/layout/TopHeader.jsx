import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const OCEAN_BLUE = '#0ea5e9';

export function TopHeader({
  selectedBedrooms,
  setSelectedBedrooms,
  selectedSegment,
  setSelectedSegment,
  availableDistricts,
  selectedDistrict,
  setSelectedDistrict,
}) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-900 mb-4">
        Singapore Private Condo Analytics
      </h1>

      {/* Global Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Bedroom Filters */}
        <div className="flex items-center gap-2">
          {['2BR', '3BR', '4BR'].map((br) => {
            const isSelected = selectedBedrooms.includes(br.toLowerCase().replace('br', 'b'));
            return (
              <button
                key={br}
                onClick={() => {
                  const bedroomKey = br.toLowerCase().replace('br', 'b');
                  if (isSelected) {
                    if (selectedBedrooms.length > 1) {
                      setSelectedBedrooms(selectedBedrooms.filter(b => b !== bedroomKey));
                    }
                  } else {
                    setSelectedBedrooms([...selectedBedrooms, bedroomKey]);
                  }
                }}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium border rounded transition-colors',
                  isSelected
                    ? 'bg-[#0ea5e9] text-white border-[#0ea5e9]'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-[#0ea5e9] hover:text-[#0ea5e9]'
                )}
              >
                [{br}]
              </button>
            );
          })}
        </div>

        {/* Pulse/Timeframe Filter */}
        <button className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded bg-white text-gray-700 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-colors flex items-center gap-1">
          [Pulse <ChevronDown className="w-3 h-3" />]
        </button>

        {/* Region Filter */}
        <button className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded bg-white text-gray-700 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-colors flex items-center gap-1">
          [All Regions <ChevronDown className="w-3 h-3" />]
        </button>
      </div>
    </div>
  );
}

