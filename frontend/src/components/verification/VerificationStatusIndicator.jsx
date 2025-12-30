/**
 * VerificationStatusIndicator - Shows verification status for data entities
 *
 * Displays the current verification state:
 * - Confirmed: Data verified by 3+ sources
 * - Mismatch: Sources disagree, needs review
 * - Pending: Verification in progress
 * - Unverified: Not yet verified
 */

import { useState } from 'react';
import { VerificationStatus } from '../../context/VerificationContext';

const STATUS_CONFIG = {
  [VerificationStatus.CONFIRMED]: {
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
    dotClass: 'bg-emerald-500',
    icon: '\u2713', // checkmark
    label: 'Verified',
    description: 'Confirmed by multiple sources',
  },
  [VerificationStatus.MISMATCH]: {
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-200',
    dotClass: 'bg-amber-500',
    icon: '\u26A0', // warning
    label: 'Mismatch',
    description: 'Sources disagree, needs review',
  },
  [VerificationStatus.PENDING]: {
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700',
    borderClass: 'border-blue-200',
    dotClass: 'bg-blue-500 animate-pulse',
    icon: '\u23F3', // hourglass
    label: 'Pending',
    description: 'Verification in progress',
  },
  [VerificationStatus.UNVERIFIED]: {
    bgClass: 'bg-gray-50',
    textClass: 'text-gray-500',
    borderClass: 'border-gray-200',
    dotClass: 'bg-gray-400',
    icon: '\u2014', // em-dash
    label: 'Unverified',
    description: 'Not yet verified',
  },
};

/**
 * VerificationStatusIndicator - Compact status display
 */
export function VerificationStatusIndicator({
  status,
  showLabel = true,
  size = 'normal', // 'small' | 'normal' | 'large'
  tooltip = true,
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const config = STATUS_CONFIG[status] || STATUS_CONFIG[VerificationStatus.UNVERIFIED];

  const sizeClasses = {
    small: 'text-xs gap-1',
    normal: 'text-sm gap-1.5',
    large: 'text-base gap-2',
  };

  const dotSizes = {
    small: 'w-1.5 h-1.5',
    normal: 'w-2 h-2',
    large: 'w-2.5 h-2.5',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => tooltip && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={`
          inline-flex items-center
          ${sizeClasses[size]}
          ${config.textClass}
          select-none cursor-default
        `}
      >
        <span className={`${dotSizes[size]} rounded-full ${config.dotClass}`} />
        {showLabel && <span>{config.label}</span>}
      </span>

      {/* Tooltip */}
      {showTooltip && tooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-40">
          <div className="bg-[#213448] text-white text-xs rounded-lg px-3 py-2 shadow-lg text-center">
            {config.description}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#213448]" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * VerificationStatusBadge - Badge-style status indicator
 */
export function VerificationStatusBadge({
  status,
  verifiedAt,
  sources = [],
  size = 'normal',
}) {
  const [expanded, setExpanded] = useState(false);

  const config = STATUS_CONFIG[status] || STATUS_CONFIG[VerificationStatus.UNVERIFIED];

  const sizeClasses = {
    small: 'px-2 py-0.5 text-xs',
    normal: 'px-2.5 py-1 text-sm',
    large: 'px-3 py-1.5 text-base',
  };

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`
          inline-flex items-center gap-1.5
          ${sizeClasses[size]}
          ${config.bgClass}
          ${config.textClass}
          border ${config.borderClass}
          rounded-full font-medium
          hover:opacity-80 transition-opacity
        `}
      >
        <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
        {config.label}
        {sources.length > 0 && (
          <span className="opacity-60">({sources.length})</span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className={`
          absolute z-40 top-full left-0 mt-2
          min-w-[200px] p-3 rounded-lg shadow-lg border
          ${config.bgClass} ${config.borderClass}
        `}>
          <div className={`text-sm font-medium ${config.textClass} mb-2`}>
            {config.icon} {config.description}
          </div>

          {verifiedAt && (
            <div className={`text-xs ${config.textClass} opacity-75 mb-2`}>
              Last verified: {new Date(verifiedAt).toLocaleDateString()}
            </div>
          )}

          {sources.length > 0 && (
            <div className="space-y-1">
              <div className={`text-xs ${config.textClass} opacity-60 uppercase`}>
                Sources
              </div>
              {sources.map((source, idx) => (
                <div
                  key={idx}
                  className={`text-sm ${config.textClass} flex items-center gap-1.5`}
                >
                  <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                  {typeof source === 'string' ? source : source.domain}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * VerificationStatusDot - Minimal dot indicator for dense tables
 */
export function VerificationStatusDot({
  status,
  size = 'normal',
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[VerificationStatus.UNVERIFIED];

  const dotSizes = {
    small: 'w-2 h-2',
    normal: 'w-2.5 h-2.5',
    large: 'w-3 h-3',
  };

  return (
    <span
      className={`inline-block ${dotSizes[size]} rounded-full ${config.dotClass}`}
      title={`${config.label}: ${config.description}`}
    />
  );
}

/**
 * VerificationSummaryCard - Card showing verification summary stats
 */
export function VerificationSummaryCard({
  confirmed = 0,
  mismatch = 0,
  pending = 0,
  unverified = 0,
  className = '',
}) {
  const total = confirmed + mismatch + pending + unverified;

  const stats = [
    { status: VerificationStatus.CONFIRMED, count: confirmed },
    { status: VerificationStatus.MISMATCH, count: mismatch },
    { status: VerificationStatus.PENDING, count: pending },
    { status: VerificationStatus.UNVERIFIED, count: unverified },
  ];

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      <div className="text-sm text-gray-500 mb-3">Verification Status</div>

      <div className="space-y-2">
        {stats.map(({ status, count }) => {
          const config = STATUS_CONFIG[status];
          const pct = total > 0 ? (count / total) * 100 : 0;

          return (
            <div key={status} className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-24">
                <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
                <span className={`text-sm ${config.textClass}`}>{config.label}</span>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${config.dotClass} transition-all duration-300`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-12 text-right text-sm text-gray-600">
                {count}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
        <span className="text-gray-500">Total</span>
        <span className="font-medium text-gray-700">{total}</span>
      </div>
    </div>
  );
}

export default VerificationStatusIndicator;
