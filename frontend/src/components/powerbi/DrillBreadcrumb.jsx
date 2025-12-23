import React from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

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
    <div className="flex flex-wrap gap-4 mb-4">
      {/* Time breadcrumbs */}
      {hasTimeBreadcrumbs && (
        <div className="flex items-center gap-1 text-sm">
          <span className="text-slate-500 mr-1">Time:</span>
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
          <span className="text-slate-400 text-xs ml-1">
            ({timeLevelLabels[drillPath.time]})
          </span>
          {breadcrumbs.time.length > 0 && (
            <button
              onClick={() => drillUp('time')}
              className="ml-2 text-blue-500 hover:text-blue-700 text-xs"
            >
              ↑ Up
            </button>
          )}
        </div>
      )}

      {/* Location breadcrumbs */}
      {hasLocationBreadcrumbs && (
        <div className="flex items-center gap-1 text-sm">
          <span className="text-slate-500 mr-1">Location:</span>
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
          <span className="text-slate-400 text-xs ml-1">
            ({locationLevelLabels[drillPath.location]})
          </span>
          {breadcrumbs.location.length > 0 && (
            <button
              onClick={() => drillUp('location')}
              className="ml-2 text-blue-500 hover:text-blue-700 text-xs"
            >
              ↑ Up
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
      className={`px-2 py-0.5 rounded transition-colors ${
        isActive
          ? 'bg-blue-100 text-blue-800 font-medium cursor-default'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
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
      className="w-4 h-4 text-slate-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default DrillBreadcrumb;
