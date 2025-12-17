import { useFilters } from '../../context/FilterContext';
import { Filter, SlidersHorizontal, BedDouble, MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';

export function FilterBar({ isSticky = true, variant = 'default' }) {
  const { filters, setBedrooms, toggleBedroom, setSegment } = useFilters();
  const isSidebar = variant === 'sidebar';

  // Sidebar variant: vertical form layout with dropdowns
  if (isSidebar) {
    const bedroomValue = (() => {
      const b = filters?.bedrooms || [];
      if (b.length === 3 && b.includes('2b') && b.includes('3b') && b.includes('4b')) return 'all';
      if (b.length === 1) {
        if (b[0] === '2b') return '2b';
        if (b[0] === '3b') return '3b';
        if (b[0] === '4b') return '4b';
      }
      return 'all';
    })();

    const handleBedroomChange = (value) => {
      if (value === '2b') setBedrooms(['2b']);
      else if (value === '3b') setBedrooms(['3b']);
      else if (value === '4b') setBedrooms(['4b']);
      else setBedrooms(['2b', '3b', '4b']); // "All" default
    };

    return (
      <div className="bg-slate-900/20 p-3 mb-3 space-y-4">
        {/* Bedrooms */}
        <div className="w-full">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            <BedDouble className="w-4 h-4 text-slate-400" />
            <span>Bedrooms</span>
          </label>
          <select
            value={bedroomValue}
            onChange={(e) => handleBedroomChange(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-100 bg-slate-900/60 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">All (2–4 BR)</option>
            <option value="2b">2 BR only</option>
            <option value="3b">3 BR only</option>
            <option value="4b">4 BR only</option>
          </select>
        </div>

        {/* Segment */}
        <div className="w-full">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            <MapPin className="w-4 h-4 text-slate-400" />
            <span>Market Segment</span>
          </label>
          <select
            value={filters?.segment}
            onChange={(e) => setSegment(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-100 bg-slate-900/60 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option>All Segments</option>
            <option>CCR</option>
            <option>RCR</option>
            <option>OCR</option>
          </select>
        </div>
      </div>
    );
  }

  // Default (header) variant with horizontal controls
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white border-slate-200 shadow-sm p-4 mb-6',
        isSticky && 'sticky top-0 z-30'
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* LEFT: Icon */}
        <div className="flex items-center gap-2 text-slate-500">
          <SlidersHorizontal className="w-5 h-5 text-[#075985]" aria-hidden="true" />
        </div>

        {/* CENTER: Filters */}
        <div className="flex flex-wrap items-center gap-3 flex-1 lg:justify-end">
          {/* Bedrooms as pills (wide layout) */}
          <div className="flex items-center flex-wrap gap-2">
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

          {/* Segments as buttons */}
          <div className="flex items-center gap-2">
            {['All Segments', 'CCR', 'RCR', 'OCR'].map((segment) => {
              const isActive = filters?.segment === segment;
              return (
                <button
                  key={segment}
                  onClick={() => setSegment(segment)}
                  className={cn(
                    'px-3.5 py-2 text-sm font-semibold rounded-md transition-all duration-200 border border-slate-200 flex items-center gap-1.5',
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
