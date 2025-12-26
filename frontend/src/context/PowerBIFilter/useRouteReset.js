/**
 * Route Reset Hook
 *
 * Resets drill state and filters when navigating between pages.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  INITIAL_DRILL_PATH,
  INITIAL_BREADCRUMBS,
  INITIAL_HIGHLIGHT,
  INITIAL_CROSS_FILTER,
  INITIAL_FACT_FILTER,
  INITIAL_SELECTED_PROJECT,
} from './constants';

/**
 * Hook to reset state on route changes.
 *
 * @param {Object} setters - State setter functions
 * @param {Function} setters.setDrillPath
 * @param {Function} setters.setBreadcrumbs
 * @param {Function} setters.setHighlight
 * @param {Function} setters.setCrossFilter
 * @param {Function} setters.setFactFilter
 * @param {Function} setters.setSelectedProject
 */
export function useRouteReset({
  setDrillPath,
  setBreadcrumbs,
  setHighlight,
  setCrossFilter,
  setFactFilter,
  setSelectedProject,
}) {
  const location = useLocation();
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    // Only reset on actual route changes, not on first mount
    if (previousPathnameRef.current !== location.pathname) {
      previousPathnameRef.current = location.pathname;

      // Reset drill state to defaults
      setDrillPath(INITIAL_DRILL_PATH);
      setBreadcrumbs(INITIAL_BREADCRUMBS);

      // Clear highlight and cross-filter
      setHighlight(INITIAL_HIGHLIGHT);
      setCrossFilter(INITIAL_CROSS_FILTER);
      setFactFilter(INITIAL_FACT_FILTER);

      // Clear selected project
      setSelectedProject(INITIAL_SELECTED_PROJECT);

      // Keep sidebar filters (districts, dateRange, etc.) - user expects them to persist
    }
  }, [
    location.pathname,
    setDrillPath,
    setBreadcrumbs,
    setHighlight,
    setCrossFilter,
    setFactFilter,
    setSelectedProject,
  ]);
}
