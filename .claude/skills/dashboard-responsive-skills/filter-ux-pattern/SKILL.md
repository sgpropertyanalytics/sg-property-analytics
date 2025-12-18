---
name: filter-ux-pattern
description: UX patterns for filter-heavy analytics dashboards. Use when building or modifying filter panels, cross-filtering systems, filter state management, or filter responsiveness. Covers desktop filter bars, mobile filter drawers, active filter indicators, and filter-to-chart binding patterns. Essential for Singapore property analytics dashboards with district, property type, bedroom, and date range filters.
---

# Filter UX Patterns for Analytics Dashboards

## Context
Data-heavy dashboards live or die by their filter UX. Users need to:
1. Quickly understand what filters are active
2. Easily apply/remove filters
3. See immediate feedback on data
4. Not lose filter state accidentally

## Filter Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Filter State (Single Source of Truth)                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ { district: [], propertyType: null, bedrooms: [],          │ │
│ │   dateRange: { start: null, end: null }, priceRange: null } │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│     │ Filter UI   │  │ URL Params  │  │ Charts/Data │          │
│     │ Components  │  │ (Sync)      │  │ (Consume)   │          │
│     └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Desktop Filter Bar Pattern

### Horizontal filter bar (1024px+)
```tsx
interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (key: string, value: any) => void;
  onClearAll: () => void;
}

export function FilterBar({ filters, onFilterChange, onClearAll }: FilterBarProps) {
  const activeCount = countActiveFilters(filters);
  
  return (
    <div className="
      bg-white border rounded-lg shadow-sm
      p-4 mb-6
    ">
      {/* Filter controls row */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Multi-select: District */}
        <FilterMultiSelect
          label="District"
          value={filters.district}
          options={DISTRICTS}
          onChange={(v) => onFilterChange('district', v)}
          placeholder="All Districts"
          className="w-48"
        />
        
        {/* Single select: Property Type */}
        <FilterSelect
          label="Property Type"
          value={filters.propertyType}
          options={PROPERTY_TYPES}
          onChange={(v) => onFilterChange('propertyType', v)}
          placeholder="All Types"
          className="w-40"
        />
        
        {/* Multi-select: Bedrooms */}
        <FilterMultiSelect
          label="Bedrooms"
          value={filters.bedrooms}
          options={BEDROOM_OPTIONS}
          onChange={(v) => onFilterChange('bedrooms', v)}
          placeholder="Any"
          className="w-36"
        />
        
        {/* Date range */}
        <FilterDateRange
          label="Transaction Date"
          value={filters.dateRange}
          onChange={(v) => onFilterChange('dateRange', v)}
          className="w-64"
        />
        
        {/* Price range */}
        <FilterPriceRange
          label="Price (SGD)"
          value={filters.priceRange}
          onChange={(v) => onFilterChange('priceRange', v)}
          className="w-48"
        />
        
        {/* Action buttons */}
        <div className="flex gap-2 ml-auto">
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              Clear all ({activeCount})
            </Button>
          )}
        </div>
      </div>
      
      {/* Active filters chips (when any active) */}
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
          {filters.district.map(d => (
            <FilterChip 
              key={d} 
              label={`District ${d}`}
              onRemove={() => removeFromArray('district', d)}
            />
          ))}
          {filters.propertyType && (
            <FilterChip 
              label={filters.propertyType}
              onRemove={() => onFilterChange('propertyType', null)}
            />
          )}
          {/* ... other active filter chips */}
        </div>
      )}
    </div>
  );
}
```

## Mobile Filter Drawer Pattern

### Bottom sheet / Side drawer (< 1024px)
```tsx
export function MobileFilterDrawer({ 
  filters, 
  onFilterChange, 
  onApply,
  onClearAll 
}: MobileFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempFilters, setTempFilters] = useState(filters);
  const activeCount = countActiveFilters(filters);
  
  // Reset temp filters when opening
  useEffect(() => {
    if (isOpen) setTempFilters(filters);
  }, [isOpen, filters]);
  
  return (
    <>
      {/* Filter toggle button - always visible on mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className="
          lg:hidden
          flex items-center gap-2
          px-4 py-3 w-full
          bg-white border rounded-lg shadow-sm
          text-left
        "
      >
        <FilterIcon className="w-5 h-5 text-gray-500" />
        <span className="font-medium">Filters</span>
        {activeCount > 0 && (
          <span className="
            ml-auto px-2 py-0.5 
            bg-blue-100 text-blue-700 
            text-sm rounded-full
          ">
            {activeCount} active
          </span>
        )}
        <ChevronRightIcon className="w-5 h-5 text-gray-400 ml-2" />
      </button>
      
      {/* Drawer overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Drawer panel */}
          <div className="
            absolute inset-y-0 right-0 
            w-full max-w-sm
            bg-white shadow-xl
            flex flex-col
            animate-slide-in-right
          ">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Filters</h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            
            {/* Filter controls - scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <FilterSection label="District">
                <FilterMultiSelect
                  value={tempFilters.district}
                  options={DISTRICTS}
                  onChange={(v) => setTempFilters(f => ({...f, district: v}))}
                  fullWidth
                />
              </FilterSection>
              
              <FilterSection label="Property Type">
                <FilterRadioGroup
                  value={tempFilters.propertyType}
                  options={[{ value: null, label: 'All' }, ...PROPERTY_TYPES]}
                  onChange={(v) => setTempFilters(f => ({...f, propertyType: v}))}
                />
              </FilterSection>
              
              <FilterSection label="Bedrooms">
                <FilterCheckboxGroup
                  value={tempFilters.bedrooms}
                  options={BEDROOM_OPTIONS}
                  onChange={(v) => setTempFilters(f => ({...f, bedrooms: v}))}
                />
              </FilterSection>
              
              <FilterSection label="Transaction Date">
                <FilterDateRange
                  value={tempFilters.dateRange}
                  onChange={(v) => setTempFilters(f => ({...f, dateRange: v}))}
                  fullWidth
                  stacked
                />
              </FilterSection>
              
              <FilterSection label="Price Range">
                <FilterPriceRange
                  value={tempFilters.priceRange}
                  onChange={(v) => setTempFilters(f => ({...f, priceRange: v}))}
                  fullWidth
                />
              </FilterSection>
            </div>
            
            {/* Footer actions - sticky */}
            <div className="p-4 border-t bg-gray-50 space-y-2">
              <Button 
                onClick={() => {
                  onApply(tempFilters);
                  setIsOpen(false);
                }}
                className="w-full"
              >
                Apply Filters
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => {
                  setTempFilters(getDefaultFilters());
                  onClearAll();
                }}
                className="w-full"
              >
                Clear All
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

## Active Filter Indicator Patterns

### Chip-based indicators
```tsx
export function FilterChip({ 
  label, 
  onRemove,
  variant = 'default' 
}: FilterChipProps) {
  return (
    <span className={`
      inline-flex items-center gap-1
      px-2 py-1 rounded-full text-sm
      ${variant === 'default' 
        ? 'bg-blue-50 text-blue-700 border border-blue-200' 
        : 'bg-gray-100 text-gray-700 border border-gray-200'
      }
    `}>
      {label}
      <button
        onClick={onRemove}
        className="
          p-0.5 rounded-full 
          hover:bg-blue-200 
          transition-colors
        "
        aria-label={`Remove ${label} filter`}
      >
        <XIcon className="w-3 h-3" />
      </button>
    </span>
  );
}
```

### Summary line (for space-constrained views)
```tsx
export function FilterSummary({ filters, onClear }: FilterSummaryProps) {
  const parts = [];
  
  if (filters.district.length) {
    parts.push(`${filters.district.length} district${filters.district.length > 1 ? 's' : ''}`);
  }
  if (filters.propertyType) {
    parts.push(filters.propertyType);
  }
  if (filters.bedrooms.length) {
    parts.push(`${filters.bedrooms.join(', ')} BR`);
  }
  if (filters.dateRange.start || filters.dateRange.end) {
    parts.push('Date range');
  }
  
  if (parts.length === 0) return null;
  
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span>Filtered by: {parts.join(' • ')}</span>
      <button 
        onClick={onClear}
        className="text-blue-600 hover:underline"
      >
        Clear
      </button>
    </div>
  );
}
```

## Filter State Management

### URL Sync Pattern (Important for shareability)
```tsx
import { useSearchParams } from 'react-router-dom'; // or Next.js equivalent

export function useFilterState() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Parse filters from URL
  const filters: FilterState = useMemo(() => ({
    district: searchParams.getAll('district'),
    propertyType: searchParams.get('type') || null,
    bedrooms: searchParams.getAll('beds'),
    dateRange: {
      start: searchParams.get('from') || null,
      end: searchParams.get('to') || null,
    },
    priceRange: {
      min: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : null,
      max: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : null,
    },
  }), [searchParams]);
  
  // Update URL when filters change
  const setFilters = useCallback((newFilters: Partial<FilterState>) => {
    const merged = { ...filters, ...newFilters };
    const params = new URLSearchParams();
    
    merged.district.forEach(d => params.append('district', d));
    if (merged.propertyType) params.set('type', merged.propertyType);
    merged.bedrooms.forEach(b => params.append('beds', b));
    if (merged.dateRange.start) params.set('from', merged.dateRange.start);
    if (merged.dateRange.end) params.set('to', merged.dateRange.end);
    if (merged.priceRange?.min) params.set('minPrice', String(merged.priceRange.min));
    if (merged.priceRange?.max) params.set('maxPrice', String(merged.priceRange.max));
    
    setSearchParams(params);
  }, [filters, setSearchParams]);
  
  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);
  
  return { filters, setFilters, clearFilters };
}
```

## Cross-Filter UX Patterns

### Visual feedback when filters affect charts
```tsx
export function ChartWithFilterFeedback({ 
  data, 
  isFiltered,
  filteredCount,
  totalCount 
}: ChartProps) {
  return (
    <div className="relative">
      {/* Filter indicator overlay */}
      {isFiltered && (
        <div className="
          absolute top-2 right-2 z-10
          px-2 py-1 rounded
          bg-blue-50 border border-blue-200
          text-xs text-blue-700
        ">
          Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()}
        </div>
      )}
      
      {/* Empty state when filters return no data */}
      {isFiltered && filteredCount === 0 ? (
        <div className="
          flex flex-col items-center justify-center
          h-64 text-gray-500
        ">
          <SearchXIcon className="w-12 h-12 mb-2 text-gray-300" />
          <p>No data matches your filters</p>
          <button 
            onClick={onClearFilters}
            className="mt-2 text-blue-600 hover:underline text-sm"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <Chart data={data} />
      )}
    </div>
  );
}
```

## Responsive Filter Rendering

### Combined component that handles both desktop and mobile
```tsx
export function ResponsiveFilters(props: FilterBarProps) {
  return (
    <>
      {/* Desktop: Horizontal bar */}
      <div className="hidden lg:block">
        <FilterBar {...props} />
      </div>
      
      {/* Mobile/Tablet: Drawer */}
      <div className="lg:hidden">
        <MobileFilterDrawer {...props} />
      </div>
    </>
  );
}
```

## Touch Target Requirements

All interactive filter elements must meet minimum touch target sizes:

```css
/* Minimum touch target: 44x44px */
.filter-control {
  min-height: 44px;
  min-width: 44px;
}

/* Dropdown trigger */
.filter-dropdown-trigger {
  min-height: 44px;
  padding: 0.5rem 1rem;
}

/* Checkbox/Radio options */
.filter-option {
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 0.75rem;
}

/* Clear/Remove buttons */
.filter-chip-remove {
  min-width: 24px;
  min-height: 24px;
  /* Plus adequate padding around the chip */
}
```

## Animation Guidelines

```css
/* Drawer slide-in */
@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.animate-slide-in-right {
  animation: slide-in-right 0.2s ease-out;
}

/* Chip appear */
@keyframes chip-appear {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}

.filter-chip-enter {
  animation: chip-appear 0.15s ease-out;
}
```

## Testing Checklist

- [ ] All filters accessible via keyboard (Tab, Enter, Space)
- [ ] Filter state persists on page refresh (URL params)
- [ ] Clear all removes all active filters
- [ ] Mobile drawer opens/closes smoothly
- [ ] Touch targets ≥ 44px on mobile
- [ ] Active filter count shows correctly
- [ ] Empty state shown when no data matches
- [ ] Filters don't block chart content when open
- [ ] Date pickers work on touch devices
