import React from 'react';
// Phase 3.3: Migrated from usePowerBIFilters to useZustandFilters
import { useZustandFilters } from '../../stores/filterStore';

/**
 * Drill-down Breadcrumb Navigation
 * 
 * Shows current drill path for time and location hierarchies.
 * WEAPON AESTHETIC: Hard edges, monospace, structural dividers.
 */
export function DrillBreadcrumb() {
  const {
    drillPath,
    breadcrumbs,
    navigateToBreadcrumb,
    drillUp,
  } = useZustandFilters();

  const hasTimeBreadcrumbs = breadcrumbs.time.length > 0;
  const hasLocationBreadcrumbs = breadcrumbs.location.length > 0;

  if (!hasTimeBreadcrumbs && !hasLocationBreadcrumbs) {
    return null;
  }

  const timeLevelLabels = {
    year: 'YEAR',
    quarter: 'QTR',
    month: 'MONTH',
  };

  const locationLevelLabels = {
    region: 'SEGMENT',
    district: 'DISTRICT',
    project: 'PROJECT',
  };

  return (
    <div className="flex flex-wrap gap-2 sm:gap-4 mb-3 sm:mb-4 font-mono">
      {/* Time breadcrumbs */}
      {hasTimeBreadcrumbs && (
        <div className="flex items-center gap-0 text-[10px] sm:text-xs border border-mono-muted bg-white/50">
          <span className="px-2 py-1 bg-mono-muted text-mono-mid font-bold border-r border-mono-muted">TIME</span>
          <div className="flex items-center px-1">
            <BreadcrumbItem
              label="ALL"
              isActive={false}
              onClick={() => navigateToBreadcrumb('time', 0)}
            />
            {breadcrumbs.time.map((crumb, index) => (
              <React.Fragment key={`time-${index}`}>
                <span className="px-1 text-mono-light opacity-50">/</span>
                <BreadcrumbItem
                  label={crumb.label.toUpperCase()}
                  isActive={index === breadcrumbs.time.length - 1}
                  onClick={() => navigateToBreadcrumb('time', index + 1)}
                />
              </React.Fragment>
            ))}
          </div>
          <span className="px-2 py-1 text-mono-light border-l border-mono-muted opacity-60">
            [{timeLevelLabels[drillPath.time]}]
          </span>
          {breadcrumbs.time.length > 0 && (
            <button
              onClick={() => drillUp('time')}
              className="px-2 py-1 hover:bg-mono-dark hover:text-white border-l border-mono-muted transition-none"
              title="Drill Up"
            >
              UP
            </button>
          )}
        </div>
      )}

      {/* Location breadcrumbs */}
      {hasLocationBreadcrumbs && (
        <div className="flex items-center gap-0 text-[10px] sm:text-xs border border-mono-muted bg-white/50">
          <span className="px-2 py-1 bg-mono-muted text-mono-mid font-bold border-r border-mono-muted">LOC</span>
          <div className="flex items-center px-1">
            <BreadcrumbItem
              label="ALL"
              isActive={false}
              onClick={() => navigateToBreadcrumb('location', 0)}
            />
            {breadcrumbs.location.map((crumb, index) => (
              <React.Fragment key={`loc-${index}`}>
                <span className="px-1 text-mono-light opacity-50">/</span>
                <BreadcrumbItem
                  label={crumb.label.toUpperCase()}
                  isActive={index === breadcrumbs.location.length - 1}
                  onClick={() => navigateToBreadcrumb('location', index + 1)}
                />
              </React.Fragment>
            ))}
          </div>
          <span className="px-2 py-1 text-mono-light border-l border-mono-muted opacity-60">
            [{locationLevelLabels[drillPath.location]}]
          </span>
          {breadcrumbs.location.length > 0 && (
            <button
              onClick={() => drillUp('location')}
              className="px-2 py-1 hover:bg-mono-dark hover:text-white border-l border-mono-muted transition-none"
              title="Drill Up"
            >
              UP
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
      className={`px-1.5 py-0.5 transition-none uppercase tracking-wider ${
        isActive
          ? 'bg-mono-dark text-white cursor-default'
          : 'text-mono-mid hover:bg-mono-muted hover:text-mono-dark'
      }`}
      disabled={isActive}
    >
      {label}
    </button>
  );
}

export default DrillBreadcrumb;
