import React, { useState } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

/**
 * Power BI-style Drill Buttons
 *
 * Provides 4 drill controls matching Power BI's visual hierarchy navigation:
 * 1. Drill Up - go back up one level in the hierarchy
 * 2. Drill Down Mode - toggle mode where clicking a data point drills down
 * 3. Go to Next Level - go to the next level for all data
 * 4. Expand All - expand all data points one level down
 *
 * @param {string} hierarchyType - 'time' | 'location' | 'bedroom'
 * @param {function} onDrillModeChange - callback when drill mode changes
 */
export function DrillButtons({
  hierarchyType = 'time',
  onDrillModeChange,
  className = ''
}) {
  const { drillPath, drillUp, drillDown, breadcrumbs } = usePowerBIFilters();
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
      // Price distribution doesn't have a natural drill hierarchy
      // But we show the controls for visual consistency
      return {
        currentLevel: 'distribution',
        currentIndex: 0,
        levels: ['distribution'],
        canDrillUp: false,
        canDrillDown: false,
        levelLabels: { distribution: 'PSF Distribution' }
      };
    } else if (hierarchyType === 'bedroom') {
      // Bedroom mix doesn't have a natural drill hierarchy
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
  const handleDrillUp = () => {
    if (canDrillUp) {
      drillUp(hierarchyType);
    }
  };

  // Toggle Drill Down Mode
  const handleToggleDrillMode = () => {
    const newMode = !drillDownMode;
    setDrillDownMode(newMode);
    if (onDrillModeChange) {
      onDrillModeChange(newMode);
    }
  };

  // Go to Next Level (for all data)
  const handleGoToNextLevel = () => {
    if (canDrillDown) {
      drillDown(hierarchyType, null, null); // null value means expand all
    }
  };

  // Expand All Down One Level
  const handleExpandAll = () => {
    if (canDrillDown) {
      drillDown(hierarchyType, '*', 'All');
    }
  };

  const buttonBaseClass = "p-1.5 rounded border transition-all duration-150 flex items-center justify-center";
  const enabledClass = "border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-600";
  const disabledClass = "border-slate-200 text-slate-300 cursor-not-allowed";
  const activeClass = "bg-blue-50 border-blue-400 text-blue-600 hover:bg-blue-100";

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {/* Drill Up Button */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDrillUp(); }}
        disabled={!canDrillUp}
        className={`${buttonBaseClass} ${canDrillUp ? enabledClass : disabledClass}`}
        title={canDrillUp ? `Drill up to ${levelLabels[levels[currentIndex - 1]]}` : 'Already at top level'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
          <path d="M12 16V8" />
          <path d="M8 12l4-4 4 4" />
        </svg>
      </button>

      {/* Drill Down Mode Toggle */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleDrillMode(); }}
        disabled={!canDrillDown}
        className={`${buttonBaseClass} ${!canDrillDown ? disabledClass : drillDownMode ? activeClass : enabledClass}`}
        title={drillDownMode ? 'Disable drill-down mode (click data point to drill)' : 'Enable drill-down mode (click data point to drill)'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
          <path d="M12 8v8" />
          <path d="M8 12l4 4 4-4" />
        </svg>
      </button>

      {/* Go to Next Level */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleGoToNextLevel(); }}
        disabled={!canDrillDown}
        className={`${buttonBaseClass} ${canDrillDown ? enabledClass : disabledClass}`}
        title={canDrillDown ? `Go to ${levelLabels[levels[currentIndex + 1]]} level` : 'Already at lowest level'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
          <path d="M12 7v6" />
          <path d="M9 10l3 3 3-3" />
          <line x1="8" y1="16" x2="16" y2="16" strokeWidth="2" />
        </svg>
      </button>

      {/* Expand All Down One Level */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleExpandAll(); }}
        disabled={!canDrillDown}
        className={`${buttonBaseClass} ${canDrillDown ? enabledClass : disabledClass}`}
        title={canDrillDown ? `Expand all to ${levelLabels[levels[currentIndex + 1]]}` : 'Already at lowest level'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
          <path d="M8 8v4" />
          <path d="M6 10l2 2 2-2" />
          <path d="M16 8v4" />
          <path d="M14 10l2 2 2-2" />
          <line x1="6" y1="16" x2="18" y2="16" strokeWidth="2" />
        </svg>
      </button>

      {/* Current Level Indicator */}
      <span className="ml-2 text-xs text-slate-500 font-medium">
        {levelLabels[currentLevel]}
      </span>
    </div>
  );
}

export default DrillButtons;
