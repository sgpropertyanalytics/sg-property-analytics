import React from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

/**
 * Power BI-style Drill Buttons - STANDARDIZED component for all charts
 *
 * Provides 2 drill controls matching Power BI's visual hierarchy navigation:
 * 1. Drill Up (↑) - go back up one level in the hierarchy
 * 2. Go to Next Level (↓) - replace entire visual with next level down
 *
 * MODES:
 * - Global mode (default): Uses PowerBIFilterContext for state
 * - Local mode: Uses props for state (when localLevel/onLocalDrillUp/onLocalDrillDown provided)
 *   Local mode follows Power BI best practice: Drill ≠ Filter (drill is visual-local)
 *
 * Best Practices (per Power BI documentation):
 * - "Expand All Down" is NOT included as it clutters dashboards and breaks scanability
 * - For property transaction dashboards, summary charts show patterns;
 *   drill-through to transaction table provides row-level details
 *
 * @param {string} hierarchyType - 'time' | 'location' | 'price' | 'bedroom'
 * @param {function} onViewTransactions - callback to scroll to transaction table
 * @param {string} localLevel - (LOCAL MODE) current drill level from parent state
 * @param {function} onLocalDrillUp - (LOCAL MODE) callback to drill up
 * @param {function} onLocalDrillDown - (LOCAL MODE) callback to drill down
 * @param {string[]} localLevels - (LOCAL MODE) array of level names ['year', 'quarter', 'month']
 * @param {object} localLevelLabels - (LOCAL MODE) labels for levels { year: 'Year', ... }
 */
export function DrillButtons({
  hierarchyType = 'time',
  onViewTransactions,
  className = '',
  // Local mode props - when provided, component uses local state instead of global context
  localLevel,
  onLocalDrillUp,
  onLocalDrillDown,
  localLevels,
  localLevelLabels,
}) {
  const { drillPath, drillUp, drillDown } = usePowerBIFilters();

  // Determine if we're in local mode (visual-local drill) or global mode
  const isLocalMode = localLevel !== undefined && onLocalDrillUp && onLocalDrillDown;

  // Get current level and available levels based on hierarchy type or local props
  const getHierarchyInfo = () => {
    // LOCAL MODE: Use props for state (visual-local drill)
    if (isLocalMode) {
      const levels = localLevels || ['year', 'quarter', 'month'];
      const labels = localLevelLabels || { year: 'Year', quarter: 'Quarter', month: 'Month' };
      const rawIndex = levels.indexOf(localLevel);
      // Safeguard: If level not found (-1), default to 0 to prevent incorrect canDrillDown
      const currentIndex = rawIndex >= 0 ? rawIndex : 0;
      return {
        currentLevel: localLevel,
        currentIndex,
        levels,
        canDrillUp: currentIndex > 0,
        canDrillDown: currentIndex < levels.length - 1,
        levelLabels: labels
      };
    }

    // GLOBAL MODE: Use context for state
    if (hierarchyType === 'time') {
      const levels = ['year', 'quarter', 'month'];
      const rawIndex = levels.indexOf(drillPath.time);
      // Safeguard: If level not found (-1), default to 0 to prevent incorrect canDrillDown
      const currentIndex = rawIndex >= 0 ? rawIndex : 0;
      return {
        currentLevel: drillPath.time,
        currentIndex,
        levels,
        canDrillUp: currentIndex > 0,
        canDrillDown: currentIndex < levels.length - 1,
        levelLabels: { year: 'Year', quarter: 'Quarter', month: 'Month' }
      };
    } else if (hierarchyType === 'location') {
      // Location hierarchy: region -> district (STOPS HERE - no project in global hierarchy)
      // Project is drill-through only, handled via setSelectedProject
      const levels = ['region', 'district'];
      const rawIndex = levels.indexOf(drillPath.location);
      // Safeguard: If level not found (-1), default to 0 to prevent incorrect canDrillDown
      const currentIndex = rawIndex >= 0 ? rawIndex : 0;
      return {
        currentLevel: drillPath.location,
        currentIndex,
        levels,
        canDrillUp: currentIndex > 0,
        canDrillDown: currentIndex < levels.length - 1,
        levelLabels: { region: 'Segment', district: 'District' }
      };
    } else if (hierarchyType === 'price') {
      // Price distribution doesn't have drill hierarchy
      return {
        currentLevel: 'distribution',
        currentIndex: 0,
        levels: ['distribution'],
        canDrillUp: false,
        canDrillDown: false,
        levelLabels: { distribution: 'PSF Distribution' }
      };
    } else if (hierarchyType === 'bedroom') {
      // Bedroom mix doesn't have drill hierarchy
      return {
        currentLevel: 'mix',
        currentIndex: 0,
        levels: ['mix'],
        canDrillUp: false,
        canDrillDown: false,
        levelLabels: { mix: 'Bedroom Mix' }
      };
    }
    return {
      currentLevel: null,
      currentIndex: 0,
      levels: [],
      canDrillUp: false,
      canDrillDown: false,
      levelLabels: {}
    };
  };

  const { currentLevel, currentIndex, levels, canDrillUp, canDrillDown, levelLabels } = getHierarchyInfo();

  // Handle Drill Up - uses local callback in local mode, global context otherwise
  const handleDrillUp = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (canDrillUp) {
      if (isLocalMode) {
        onLocalDrillUp();
      } else {
        drillUp(hierarchyType);
      }
    }
  };

  // Go to Next Level (for all data) - uses local callback in local mode
  const handleGoToNextLevel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (canDrillDown) {
      if (isLocalMode) {
        onLocalDrillDown();
      } else {
        drillDown(hierarchyType, null, null);
      }
    }
  };

  // View Transactions (scroll to table)
  const handleViewTransactions = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onViewTransactions) {
      onViewTransactions();
    } else {
      // Default: scroll to transaction table
      const table = document.getElementById('transaction-data-table');
      if (table) {
        table.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Button styles using theme colors
  const buttonBase = "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150";
  const enabledStyle = "bg-white border border-[#94B4C1] hover:bg-[#EAE0CF] hover:border-[#547792] text-[#547792] shadow-sm";
  const disabledStyle = "bg-[#EAE0CF]/50 border border-[#94B4C1]/50 text-[#94B4C1] cursor-not-allowed";

  // Check if any drill functions are available
  const hasDrillHierarchy = canDrillUp || canDrillDown;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Drill Up Button */}
      {hasDrillHierarchy && (
        <button
          type="button"
          onClick={handleDrillUp}
          disabled={!canDrillUp}
          className={`${buttonBase} ${canDrillUp ? enabledStyle : disabledStyle}`}
          title={canDrillUp ? `Drill up to ${levelLabels[levels[currentIndex - 1]]}` : 'At top level'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9V3" />
            <path d="M3 6l3-3 3 3" />
          </svg>
        </button>
      )}

      {/* Go to Next Level */}
      {hasDrillHierarchy && (
        <button
          type="button"
          onClick={handleGoToNextLevel}
          disabled={!canDrillDown}
          className={`${buttonBase} ${canDrillDown ? enabledStyle : disabledStyle}`}
          title={canDrillDown ? `Go to ${levelLabels[levels[currentIndex + 1]]} level` : 'At lowest level'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3v6" />
            <path d="M3 6l3 3 3-3" />
          </svg>
        </button>
      )}

      {/* Separator */}
      {hasDrillHierarchy && (
        <div className="w-px h-5 bg-[#94B4C1] mx-0.5" />
      )}

      {/* View Transactions Button */}
      <button
        type="button"
        onClick={handleViewTransactions}
        className={`${buttonBase} ${enabledStyle}`}
        title="View transaction details"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="2" width="10" height="8" rx="1" />
          <line x1="1" y1="5" x2="11" y2="5" />
          <line x1="4" y1="2" x2="4" y2="10" />
        </svg>
      </button>

      {/* Current Level Label */}
      {hasDrillHierarchy && (
        <span className="ml-1 text-xs text-[#547792] font-medium whitespace-nowrap">
          {levelLabels[currentLevel]}
        </span>
      )}
    </div>
  );
}

export default DrillButtons;
