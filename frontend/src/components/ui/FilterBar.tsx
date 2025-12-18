import React, { ReactNode, useState, useEffect, useCallback } from 'react';

/**
 * FilterBar - Responsive filter bar with mobile drawer pattern
 *
 * Following filter-ux-pattern skill:
 * - Desktop (1024px+): Horizontal filter bar with inline controls
 * - Tablet/Mobile (< 1024px): Filter button that opens a drawer
 * - Active filter chips always visible
 * - Touch targets >= 44px on mobile
 *
 * This component provides the LAYOUT pattern for filters.
 * Filter logic (state, API) should remain in context/parent components.
 */

interface FilterBarProps {
  /** Filter controls to render (desktop: inline, mobile: in drawer) */
  children: ReactNode;
  /** Number of active filters (shows badge) */
  activeCount?: number;
  /** Callback when "Clear all" is clicked */
  onClearAll?: () => void;
  /** Active filter chips to display */
  filterChips?: ReactNode;
  /** Additional actions in the bar header */
  actions?: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Drawer title for mobile */
  drawerTitle?: string;
}

export function FilterBar({
  children,
  activeCount = 0,
  onClearAll,
  filterChips,
  actions,
  className = '',
  drawerTitle = 'Filters',
}: FilterBarProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Close drawer on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        setIsDrawerOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isDrawerOpen]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  return (
    <>
      {/* Desktop Filter Bar - Hidden on mobile */}
      <div className={`hidden lg:block ${className}`}>
        <div className="bg-white border border-[#94B4C1]/50 rounded-lg shadow-sm p-4">
          {/* Filter controls row */}
          <div className="flex flex-wrap items-end gap-3 xl:gap-4">
            {children}

            {/* Spacer and actions */}
            <div className="flex items-center gap-2 ml-auto">
              {activeCount > 0 && onClearAll && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-sm text-[#547792] hover:text-[#213448] px-3 py-2 rounded hover:bg-[#EAE0CF] transition-colors"
                >
                  Clear all ({activeCount})
                </button>
              )}
              {actions}
            </div>
          </div>

          {/* Active filter chips */}
          {filterChips && activeCount > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#94B4C1]/30">
              {filterChips}
            </div>
          )}
        </div>
      </div>

      {/* Mobile/Tablet Filter Trigger - Hidden on desktop */}
      <div className={`lg:hidden ${className}`}>
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="
            flex items-center gap-2
            w-full px-4 py-3
            bg-white border border-[#94B4C1]/50 rounded-lg shadow-sm
            text-left
            min-h-[44px]
            active:bg-[#EAE0CF]/50
            transition-colors
          "
        >
          <FilterIcon className="w-5 h-5 text-[#547792] flex-shrink-0" />
          <span className="font-medium text-[#213448]">Filters</span>
          {activeCount > 0 && (
            <span className="ml-auto px-2.5 py-0.5 bg-[#547792] text-white text-sm rounded-full font-medium">
              {activeCount}
            </span>
          )}
          <ChevronRightIcon className="w-5 h-5 text-[#94B4C1] ml-1 flex-shrink-0" />
        </button>

        {/* Active filter chips on mobile (always visible below trigger) */}
        {filterChips && activeCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 px-1">
            {filterChips}
          </div>
        )}
      </div>

      {/* Mobile Filter Drawer */}
      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={drawerTitle}
        activeCount={activeCount}
        onClearAll={onClearAll}
      >
        {children}
      </FilterDrawer>
    </>
  );
}

/**
 * FilterDrawer - Slide-in drawer for mobile filters
 */
interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  activeCount?: number;
  onClearAll?: () => void;
  onApply?: () => void;
}

export function FilterDrawer({
  isOpen,
  onClose,
  title,
  children,
  activeCount = 0,
  onClearAll,
  onApply,
}: FilterDrawerProps) {
  if (!isOpen) return null;

  const handleApply = () => {
    onApply?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="
          absolute inset-y-0 right-0
          w-full max-w-sm
          bg-white shadow-xl
          flex flex-col
          animate-slide-in-right
        "
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-drawer-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#94B4C1]/30 bg-[#213448]">
          <div className="flex items-center gap-2">
            <FilterIcon className="w-5 h-5 text-[#94B4C1]" />
            <h2 id="filter-drawer-title" className="font-semibold text-white">
              {title}
            </h2>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 bg-[#547792] text-white text-xs rounded-full">
                {activeCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#547792]/30 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close filters"
          >
            <XIcon className="w-5 h-5 text-[#94B4C1]" />
          </button>
        </div>

        {/* Filter controls - scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {children}
        </div>

        {/* Footer actions - sticky */}
        <div className="p-4 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30 space-y-2">
          <button
            type="button"
            onClick={handleApply}
            className="
              w-full py-3 px-4
              bg-[#213448] text-white font-medium
              rounded-lg
              hover:bg-[#547792]
              transition-colors
              min-h-[44px]
            "
          >
            Apply Filters
          </button>
          {onClearAll && (
            <button
              type="button"
              onClick={() => {
                onClearAll();
                onClose();
              }}
              disabled={activeCount === 0}
              className="
                w-full py-3 px-4
                bg-transparent text-[#547792]
                rounded-lg border border-[#94B4C1]
                hover:bg-[#94B4C1]/20
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
                min-h-[44px]
              "
            >
              Clear All
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * FilterChip - Removable chip showing an active filter
 */
interface FilterChipProps {
  label: string;
  onRemove?: () => void;
  variant?: 'default' | 'primary';
}

export function FilterChip({ label, onRemove, variant = 'default' }: FilterChipProps) {
  const variantClasses = {
    default: 'bg-[#EAE0CF] text-[#213448] border-[#94B4C1]/50',
    primary: 'bg-[#547792]/20 text-[#213448] border-[#547792]/30',
  };

  return (
    <span className={`
      inline-flex items-center gap-1
      px-2.5 py-1
      rounded-full text-xs md:text-sm
      border
      ${variantClasses[variant]}
    `}>
      <span className="truncate max-w-[150px]">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="
            p-0.5 rounded-full
            hover:bg-[#547792]/20
            transition-colors
            min-w-[20px] min-h-[20px]
            flex items-center justify-center
          "
          aria-label={`Remove ${label} filter`}
        >
          <XIcon className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/**
 * FilterSection - Group filters with a label in the drawer
 */
interface FilterSectionProps {
  label: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function FilterSection({
  label,
  children,
  collapsible = false,
  defaultExpanded = true,
}: FilterSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!collapsible) {
    return (
      <div>
        <label className="block text-xs font-medium text-[#547792] mb-2 uppercase tracking-wide">
          {label}
        </label>
        {children}
      </div>
    );
  }

  return (
    <div className="border-b border-[#94B4C1]/30 pb-4">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="
          w-full flex items-center justify-between
          py-2
          text-left font-medium text-[#213448]
          min-h-[44px]
        "
      >
        <span>{label}</span>
        <ChevronDownIcon className={`w-4 h-4 text-[#547792] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      {isExpanded && (
        <div className="pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * FilterControl - Wrapper for individual filter controls with responsive styling
 */
interface FilterControlProps {
  label: string;
  children: ReactNode;
  className?: string;
  /** Width on desktop */
  width?: 'auto' | 'sm' | 'md' | 'lg';
  /** Full width on mobile */
  fullWidthMobile?: boolean;
}

export function FilterControl({
  label,
  children,
  className = '',
  width = 'auto',
  fullWidthMobile = true,
}: FilterControlProps) {
  const widthClasses = {
    auto: '',
    sm: 'w-32 lg:w-36',
    md: 'w-40 lg:w-48',
    lg: 'w-48 lg:w-64',
  };

  return (
    <div className={`
      ${fullWidthMobile ? 'w-full lg:w-auto' : ''}
      ${widthClasses[width]}
      ${className}
    `}>
      <label className="block text-xs font-medium text-[#547792] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

// Icon components
function FilterIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  );
}

function ChevronRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ChevronDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function XIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default FilterBar;
