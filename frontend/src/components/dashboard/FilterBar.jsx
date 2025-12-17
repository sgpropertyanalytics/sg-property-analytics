import { useFilters } from '../../context/FilterContext';
import { Filter, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

export function FilterBar({ isSticky = true }) {
  const { filters, toggleBedroom, setSegment } = useFilters();

  return (
    <div
      className={cn(
        'bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6',
        isSticky && 'sticky top-0 z-30'
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* LEFT: Title & Context */}
        <div className="flex items-center gap-2 text-slate-500">
          <SlidersHorizontal className="w-5 h-5 text-[#075985]" />
          <span className="text-sm font-semibold uppercase tracking-wider">Filter</span>
        </div>

        {/* CENTER: The Active Filters */}
        <div className="flex flex-wrap items-center gap-3 flex-1 lg:justify-end">
          
          {/* 1. Bedrooms (Pill Toggles) - No grey background container */}
          <div className="flex items-center gap-2">
            {['1', '2', '3', '4', '5+'].map((num) => {
              const val = num === '5+' ? '5b' : `${num}b`;
              const isActive = filters?.bedrooms?.includes(val);
              return (
                <button
                  key={num}
                  onClick={() => toggleBedroom(val)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 border border-slate-200',
                    isActive
                      ? 'bg-[#075985] text-white shadow-sm'
                      : 'bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {num} <span className="hidden sm:inline">BR</span>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px h-8 bg-slate-200 mx-1"></div>

          {/* 2. Market Segment (Button Filters) */}
          <div className="flex items-center gap-2">
            {['All Segments', 'CCR', 'RCR', 'OCR'].map((segment) => {
              const isActive = filters?.segment === segment;
              return (
                <button
                  key={segment}
                  onClick={() => setSegment(segment)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 border border-slate-200 flex items-center gap-1.5',
                    isActive
                      ? 'bg-[#075985] text-white shadow-sm'
                      : 'bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {segment}
                  {segment === 'All Segments' && (
                    <Filter className="w-3 h-3" />
                  )}
                </button>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
