import React from 'react';
import { HelpTooltip } from './HelpTooltip';
import { FrostOverlay } from '../common/loading';

/**
 * KPICardV2 - Universal Card System
 *
 * Two-layer architecture (title + hero):
 * ┌─────────────────────────────────────────┐
 * │ LABEL  (?)                     ← top    │
 * │                                         │
 * │ $1,858 psf                              │
 * │ ▲ +3.2% QoQ                    ← hero   │
 * │ Prev: $1,763 psf                        │
 * └─────────────────────────────────────────┘
 *
 * Footnote moved to tooltip hover.
 */

interface KPICardV2Props {
  title: string;
  /** Subtitle shown below title (methodology context) */
  subtitle?: string;
  /** Tooltip text shown on hover of info icon */
  tooltip?: string;
  /** Primary value - can be string or structured ReactNode */
  value: string | React.ReactNode;
  /** Inline badge shown after value (e.g., "Seller advantage" → displays first word only) */
  badge?: {
    text: string;
    color: 'green' | 'red' | 'gray';
  };
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  /** Footnote text - now appended to tooltip instead of footer */
  footnote?: string;
  /** @deprecated Use footnote instead */
  transition?: string;
  loading?: boolean;
  className?: string;
}

// Badge color mapping
const BADGE_COLORS = {
  green: 'text-status-live',
  red: 'text-status-negative',
  gray: 'text-mono-light',
} as const;

/**
 * KPIHeroContent - Shared content pattern for KPI cards
 *
 * Handles value + badge + change + previous in a standardized way.
 * Use this inside KPICardV2 value prop for consistent rendering.
 *
 * Badge displays only first word to prevent overflow (e.g., "Seller advantage" → "SELLER")
 */
interface KPIHeroContentProps {
  /** Main value (number or formatted string) */
  value: string | number;
  /** Optional unit suffix (e.g., "psf", "%") */
  unit?: string;
  /** Badge text and color (displays first word only, uppercased) */
  badge?: {
    text: string;
    color: 'green' | 'red' | 'gray';
  };
  /** Quarter-over-quarter change */
  change?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  /** Previous period value */
  previous?: {
    value: string | number;
    label?: string; // defaults to "Prev:"
  };
}

export function KPIHeroContent({
  value,
  unit,
  badge,
  change,
  previous,
}: KPIHeroContentProps) {
  const changeColor = change?.direction === 'up' ? 'text-status-live'
    : change?.direction === 'down' ? 'text-status-negative'
      : 'text-mono-light';
  const arrow = change?.direction === 'up' ? '▲'
    : change?.direction === 'down' ? '▼'
      : '—';
  const pctStr = change?.value != null
    ? (change.value >= 0 ? `+${change.value}%` : `${change.value}%`)
    : '';

  return (
    <>
      {/* Main value row with badge */}
      <div
        className="text-[22px] sm:text-[28px] font-data font-bold text-mono-ink tracking-tight truncate"
        title={badge ? `${value} ${badge.text}` : String(value)}
      >
        {value}
        {unit && (
          <span className="ml-1 text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-mono-mid">
            {unit}
          </span>
        )}
        {badge && (
          <span className={`ml-1.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${BADGE_COLORS[badge.color]}`}>
            {badge.text.split(' ')[0]}
          </span>
        )}
      </div>
      {/* QoQ change row */}
      {change?.value != null && (
        <div className={`text-xs sm:text-sm font-medium ${changeColor}`}>
          {arrow} {pctStr} QoQ
        </div>
      )}
      {/* Previous value row */}
      {previous && (
        <div className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-mono-light">
          {previous.label || 'Prev:'} {previous.value}
        </div>
      )}
    </>
  );
}

export function KPICardV2({
  title,
  subtitle,
  tooltip,
  value,
  badge,
  trend: _trend,
  footnote,
  transition,
  loading = false,
  className = '',
}: KPICardV2Props) {
  // Combine tooltip and footnote for hover display
  const footerText = footnote || transition;
  const combinedTooltip = [tooltip, footerText].filter(Boolean).join('\n\n');

  // Loading state - show frost overlay
  if (loading) {
    return (
      <div
        className={`
          weapon-card hud-corner weapon-shadow overflow-hidden
          min-h-40
          ${className}
        `.trim()}
      >
        <FrostOverlay height={160} showSpinner={false} showProgress />
      </div>
    );
  }

  return (
    <div
      className={`
        weapon-card hud-corner weapon-shadow p-4 sm:p-5
        min-h-40 flex flex-col relative
        transition-none
        ${className}
      `.trim()}
    >
      {/* Ruler Ticks - Top Edge */}
      <div className="absolute top-0 left-1/4 w-px h-1.5 bg-black/10 z-10" />
      <div className="absolute top-0 left-1/2 w-px h-2 bg-black/20 z-10" />
      <div className="absolute top-0 left-3/4 w-px h-1.5 bg-black/10 z-10" />

      {/* Layer 1: Header - pinned to top */}
      <div className="flex-shrink-0 mb-2">
        <div>
          <div className="flex items-center gap-1">
            <span className="terminal-header text-mono-mid">
              {title}
            </span>
            {combinedTooltip && (
              <HelpTooltip content={combinedTooltip} />
            )}
          </div>
          {subtitle && (
            <p className="text-[9px] text-mono-light mt-0.5 leading-tight">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Layer 2: Hero Data - fills remaining space, aligned to bottom */}
      <div className="flex-1 flex items-end pb-2 min-w-0">
        {typeof value === 'string' ? (
          <div className="truncate" title={badge ? `${value} ${badge.text}` : value}>
            <span className="text-[22px] sm:text-[32px] font-data font-semibold text-mono-ink leading-none">

              {value}
            </span>
            {badge && (
              <span className={`ml-1.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${BADGE_COLORS[badge.color]}`}>
                {badge.text.split(' ')[0]}
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-1 min-w-0 overflow-hidden">{value}</div>
        )}
      </div>
    </div>
  );
}

/**
 * KPICardV2Group - Grid wrapper for KPI cards
 */
export function KPICardV2Group({
  children,
  columns = 4,
  className = '',
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
  };

  return (
    <div className={`grid gap-3 md:gap-4 ${gridCols[columns]} ${className} overflow-visible`}>
      {children}
    </div>
  );
}

export default KPICardV2;
