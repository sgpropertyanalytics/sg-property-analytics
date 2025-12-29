/**
 * FilterSummary - Inline summary of active filters
 *
 * Shows current filter state in compact format:
 * "Showing: CCR · 2-3BR · Last 12 Months · All Districts"
 */

import { useMemo } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

// Format date range for display
function formatDateRange(dateRange) {
  if (!dateRange?.start && !dateRange?.end) {
    return null;
  }

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  // Calculate months difference to show preset label
  if (dateRange.start && dateRange.end) {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

    if (monthsDiff <= 3) return 'Last 3 Months';
    if (monthsDiff <= 12) return 'Last 12 Months';
    if (monthsDiff <= 24) return 'Last 2 Years';
    if (monthsDiff <= 60) return 'Last 5 Years';

    // Custom range
    return `${formatDate(start)} - ${formatDate(end)}`;
  }

  return null;
}

export function FilterSummary() {
  const { filters, activeFilterCount } = usePowerBIFilters();

  const summaryParts = useMemo(() => {
    const parts = [];

    // Regions
    const segments = filters.segments || [];
    if (segments.length > 0 && segments.length < 3) {
      parts.push(segments.join(', '));
    }

    // Bedrooms
    const bedrooms = filters.bedroomTypes || [];
    if (bedrooms.length > 0 && bedrooms.length < 5) {
      const bedroomLabels = bedrooms.map(b => `${b}BR`);
      parts.push(bedroomLabels.join(', '));
    }

    // Date range
    const dateStr = formatDateRange(filters.dateRange);
    if (dateStr) {
      parts.push(dateStr);
    }

    // Districts
    const districts = filters.districts || [];
    if (districts.length === 1) {
      parts.push(districts[0]);
    } else if (districts.length > 1) {
      parts.push(`${districts.length} districts`);
    }

    return parts;
  }, [filters]);

  // Don't render if no filters active
  if (activeFilterCount === 0 || summaryParts.length === 0) {
    return null;
  }

  return (
    <div
      className="px-4 py-2 mt-2 bg-card/40 rounded-md"
      role="status"
      aria-live="polite"
    >
      <span className="text-sm text-[#547792]">
        <span className="font-medium">Showing:</span>{' '}
        {summaryParts.join(' · ')}
      </span>
    </div>
  );
}

export default FilterSummary;
