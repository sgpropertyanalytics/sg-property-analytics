import React, { useState } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

/**
 * Power BI-style Drill Buttons
 *
 * Provides 3 drill controls matching Power BI's visual hierarchy navigation:
 * 1. Drill Up (↑) - go back up one level in the hierarchy
 * 2. Drill Down Mode - toggle mode where clicking a data point drills into it
 * 3. Go to Next Level (↓) - replace entire visual with next level down
 *
 * Best Practices (per Power BI documentation):
 * - "Expand All Down" is NOT included as it clutters dashboards and breaks scanability
 * - For property transaction dashboards, summary charts show patterns;
 *   drill-through to transaction table provides row-level details
 *
 * @param {string} hierarchyType - 'time' | 'location' | 'price' | 'bedroom'
 * @param {function} onDrillModeChange - callback when drill mode changes
 * @param {function} onViewTransactions - callback to scroll to transaction table
 */
export function DrillButtons({
  hierarchyType = 'time',
  onDrillModeChange,
  onViewTransactions,
  className = ''
}) {
  const { drillPath, drillUp, drillDown } = usePowerBIFilters();
  const [drillDownMode, setDrillDownMode] = useState(false);

  // Get current level and available levels based on hierarchy type
  const getHierarchyInfo = () => {
    if (hierarchyType === 'time') {
      const levels = ['year', 'quarter', 'month'];
      const currentIndex = levels.indexOf(drillPath.time);
      return {
        currentLevel: drillPath.time,
        currentIndex,
        levels,
        canDrillUp: currentIndex > 0,
        canDrillDown: currentIndex < levels.length - 1,
        levelLabels: { year: 'Year', quarter: 'Quarter', month: 'Month' }
      };
    } else if (hierarchyType === 'location') {
      const levels = ['region', 'district', 'project'];
      const currentIndex = levels.indexOf(drillPath.location);
      return {
        currentLevel: drillPath.location,
        currentIndex,
        levels,
        canDrillUp: currentIndex > 0,
        canDrillDown: currentIndex < levels.length - 1,
        levelLabels: { region: 'Region', district: 'District', project: 'Project' }
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

  // Handle Drill Up
  const handleDrillUp = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (canDrillUp) {
      drillUp(hierarchyType);
    }
  };

  // Toggle Drill Down Mode
  const handleToggleDrillMode = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const newMode = !drillDownMode;
    setDrillDownMode(newMode);
    if (onDrillModeChange) {
      onDrillModeChange(newMode);
    }
  };

  // Go to Next Level (for all data)
  const handleGoToNextLevel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (canDrillDown) {
      drillDown(hierarchyType, null, null);
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

  // Button styles
  const buttonBase = "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150";
  const enabledStyle = "bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-600 shadow-sm";
  const disabledStyle = "bg-slate-50 border border-slate-200 text-slate-300 cursor-not-allowed";
  const activeStyle = "bg-blue-500 border border-blue-500 text-white hover:bg-blue-600 shadow-sm";

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

      {/* Drill Down Mode Toggle - Click specific data point to drill */}
      {hasDrillHierarchy && (
        <button
          type="button"
          onClick={handleToggleDrillMode}
          disabled={!canDrillDown}
          className={`${buttonBase} ${!canDrillDown ? disabledStyle : drillDownMode ? activeStyle : enabledStyle}`}
          title={drillDownMode ? 'Click mode ON: Click chart element to drill down' : 'Enable click-to-drill mode'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="4" r="2" strokeWidth="1.5" />
            <path d="M6 6v3" />
            <path d="M4 7l2 2 2-2" />
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
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
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
        <span className="ml-1 text-xs text-slate-500 font-medium whitespace-nowrap">
          {levelLabels[currentLevel]}
        </span>
      )}

      {/* Drill Mode Indicator */}
      {drillDownMode && canDrillDown && (
        <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded font-medium">
          Click to drill
        </span>
      )}
    </div>
  );
}

export default DrillButtons;
