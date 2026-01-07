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
}) {
  return (
    <div
      className={`
        weapon-card hud-corner scan-line-hover
        overflow-hidden flex flex-col
        ${interactive ? 'cursor-crosshair' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {title && (
        <div className="terminal-header px-4 py-2 border-b border-mono-muted flex justify-between items-center shrink-0">
          <span>{title}</span>
          {live && (
            <span className="text-status-live flex items-center gap-1">
              <span className="pulse-ring-emerald w-2 h-2 rounded-full bg-status-live" />
              <span className="text-[9px]">LIVE</span>
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
          <span className="text-[9px]">LIVE</span>
        </span>
      )}
    </div>
  );
}

export default WeaponCard;
