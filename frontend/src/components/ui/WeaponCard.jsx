import React from 'react';

/**
 * WeaponCard - Munitions-grade card wrapper with HUD corners
 *
 * Design System:
 * - Hard edges (no border-radius)
 * - HUD corner brackets (top-left, bottom-right)
 * - Terminal-style header option
 * - Scan-line hover effect
 * - Crosshair cursor on interactive areas
 *
 * Usage:
 *   <WeaponCard title="PRICE TREND">
 *     <ChartSlot><Chart /></ChartSlot>
 *   </WeaponCard>
 *
 *   <WeaponCard title="SUPPLY DATA" live>
 *     <Table />
 *   </WeaponCard>
 */

export function WeaponCard({
  children,
  title,
  live = false,
  className = '',
  interactive = true,
  noPadding = false,
  variant = 'primary', // 'primary' | 'secondary'
}) {
  return (
    <div
      className={`
        bg-white border border-gray-200 shadow-sm
        overflow-hidden flex flex-col relative
        ${interactive ? 'cursor-crosshair' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {title && (
        <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center shrink-0">
          <span className="text-sm font-medium text-gray-500 uppercase tracking-widest">{title}</span>
          {live && (
            <span className="text-emerald-600 flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-medium tracking-wider">LIVE</span>
            </span>
          )}
        </div>
      )}
      <div className={noPadding ? 'flex-1 min-h-0' : 'flex-1 min-h-0 p-4'}>
        {children}
      </div>
    </div>
  );
}

/**
 * WeaponCardHeader - Standalone terminal header for existing cards
 *
 * Use when you can't wrap with WeaponCard but need the header style.
 */
export function WeaponCardHeader({ title, live = false, className = '' }) {
  return (
    <div className={`terminal-header px-4 py-2 border-b border-mono-muted flex justify-between items-center ${className}`}>
      <span>{title}</span>
      {live && (
        <span className="text-status-live flex items-center gap-1">
          <span className="pulse-ring-emerald w-2 h-2 rounded-full bg-status-live" />
          <span className="text-xs">LIVE</span>
        </span>
      )}
    </div>
  );
}

export default WeaponCard;
