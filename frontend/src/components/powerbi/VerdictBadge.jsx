/**
 * VerdictBadge - Green/Yellow/Red verdict indicator for price band analysis
 *
 * Displays a colored badge indicating the downside protection verdict:
 * - Protected (green): Unit is above floor with stable/rising trend
 * - Watch Zone (yellow): Unit near floor or floor is weakening
 * - Exposed (red): Unit is below historical floor
 */

import { useState } from 'react';

const BADGE_CONFIG = {
  protected: {
    bgClass: 'bg-emerald-100',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-300',
    icon: '🟢',
    defaultLabel: 'Protected'
  },
  watch: {
    bgClass: 'bg-amber-100',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-300',
    icon: '🟡',
    defaultLabel: 'Watch Zone'
  },
  exposed: {
    bgClass: 'bg-red-100',
    textClass: 'text-red-700',
    borderClass: 'border-red-300',
    icon: '🔴',
    defaultLabel: 'Exposed'
  }
};

export function VerdictBadge({
  badge = 'watch',
  label,
  tooltip,
  size = 'normal', // 'small' | 'normal' | 'large'
  showIcon = true
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const config = BADGE_CONFIG[badge] || BADGE_CONFIG.watch;
  const displayLabel = label || config.defaultLabel;

  // Size variants
  const sizeClasses = {
    small: 'px-2 py-0.5 text-xs',
    normal: 'px-3 py-1 text-sm',
    large: 'px-4 py-1.5 text-base'
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => tooltip && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={`
          inline-flex items-center gap-1.5
          ${sizeClasses[size]}
          ${config.bgClass}
          ${config.textClass}
          border ${config.borderClass}
          rounded-full font-semibold
          select-none
        `}
      >
        {showIcon && <span className="text-xs">{config.icon}</span>}
        {displayLabel}
      </span>

      {/* Tooltip */}
      {showTooltip && tooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64">
          <div className="bg-brand-navy text-white text-xs rounded-lg px-3 py-2 shadow-lg">
            {tooltip}
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0F172A]" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * VerdictBadgeLarge - Larger badge with explanation text for prominent display
 */
export function VerdictBadgeLarge({
  badge = 'watch',
  label,
  explanation,
  position,
  vsFloorPct
}) {
  const config = BADGE_CONFIG[badge] || BADGE_CONFIG.watch;
  const displayLabel = label || config.defaultLabel;

  return (
    <div className={`
      flex items-start gap-3 p-3 rounded-lg border
      ${config.bgClass} ${config.borderClass}
    `}>
      {/* Icon */}
      <span className="text-2xl flex-shrink-0 mt-0.5">{config.icon}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-bold ${config.textClass}`}>
            {displayLabel}
          </span>
          {position && (
            <span className={`text-xs ${config.textClass} opacity-75`}>
              ({position})
            </span>
          )}
        </div>

        {explanation && (
          <p className={`text-sm ${config.textClass} opacity-90`}>
            {explanation}
          </p>
        )}

        {vsFloorPct !== undefined && (
          <p className={`text-xs ${config.textClass} opacity-75 mt-1`}>
            {vsFloorPct >= 0 ? '+' : ''}{vsFloorPct.toFixed(1)}% vs floor (P25)
          </p>
        )}
      </div>
    </div>
  );
}

export default VerdictBadge;
