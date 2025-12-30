import React from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilter';

/**
 * Drill-down Breadcrumb Navigation
 *
 * Shows current drill path for time and location hierarchies.
 * Allows navigating back to previous levels.
 *
 * Time: All > 2024 > Q3 > September
 * Location: All > CCR > D09 > Marina Bay Suites
 */
export function DrillBreadcrumb() {
  const {
    drillPath,
    breadcrumbs,
    navigateToBreadcrumb,
    drillUp,
  } = usePowerBIFilters();

  const hasTimeBreadcrumbs = breadcrumbs.time.length > 0;
  const hasLocationBreadcrumbs = breadcrumbs.location.length > 0;

  if (!hasTimeBreadcrumbs && !hasLocationBreadcrumbs) {
    return null;
  }

  const timeLevelLabels = {
    year: 'Year',
    quarter: 'Quarter',
    month: 'Month',
  };

  const locationLevelLabels = {
    region: 'Segment',
    district: 'District',
    project: 'Project',
  };

  return (
    <div className="flex flex-wrap gap-2 sm:gap-4 mb-3 sm:mb-4">
      {/* Time breadcrumbs */}
      {hasTimeBreadcrumbs && (
        <div className="flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm">
          <span className="text-[#547792] mr-0.5 sm:mr-1">Time:</span>
          <BreadcrumbItem
            label="All"
            isActive={false}
            onClick={() => navigateToBreadcrumb('time', 0)}
          />
          {breadcrumbs.time.map((crumb, index) => (
            <React.Fragment key={`time-${index}`}>
              <ChevronIcon />
              <BreadcrumbItem
                label={crumb.label}
                isActive={index === breadcrumbs.time.length - 1}
                onClick={() => navigateToBreadcrumb('time', index + 1)}
              />
            </React.Fragment>
          ))}
          <span className="hidden sm:inline text-[#94B4C1] text-xs ml-1">
            ({timeLevelLabels[drillPath.time]})
          </span>
          {breadcrumbs.time.length > 0 && (
            <button
              onClick={() => drillUp('time')}
              className="ml-1 sm:ml-2 text-[#547792] hover:text-[#213448] text-xs"
            >
              ↑
            </button>
          )}
        </div>
      )}

      {/* Location breadcrumbs */}
      {hasLocationBreadcrumbs && (
        <div className="flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm">
          <span className="text-[#547792] mr-0.5 sm:mr-1">Loc:</span>
          <BreadcrumbItem
            label="All"
            isActive={false}
            onClick={() => navigateToBreadcrumb('location', 0)}
          />
          {breadcrumbs.location.map((crumb, index) => (
            <React.Fragment key={`loc-${index}`}>
              <ChevronIcon />
              <BreadcrumbItem
                label={crumb.label}
                isActive={index === breadcrumbs.location.length - 1}
                onClick={() => navigateToBreadcrumb('location', index + 1)}
              />
            </React.Fragment>
          ))}
          <span className="hidden sm:inline text-[#94B4C1] text-xs ml-1">
            ({locationLevelLabels[drillPath.location]})
          </span>
          {breadcrumbs.location.length > 0 && (
            <button
              onClick={() => drillUp('location')}
              className="ml-1 sm:ml-2 text-[#547792] hover:text-[#213448] text-xs"
            >
              ↑
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BreadcrumbItem({ label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 sm:px-2 py-0.5 rounded transition-colors text-xs sm:text-sm ${
        isActive
          ? 'bg-[#547792]/20 text-[#213448] font-medium cursor-default'
          : 'text-[#547792] hover:bg-[#EAE0CF]/50 hover:text-[#213448]'
      }`}
      disabled={isActive}
    >
      {label}
    </button>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="w-3 h-3 sm:w-4 sm:h-4 text-[#94B4C1]"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default DrillBreadcrumb;
