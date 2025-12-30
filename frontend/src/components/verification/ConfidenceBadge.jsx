/**
 * ConfidenceBadge - Confidence score indicator for data verification
 *
 * Displays a colored badge indicating the confidence level of verified data:
 * - High (green): 3+ sources agree (score >= 0.9)
 * - Medium (yellow): 2 sources agree (score 0.7-0.89)
 * - Low (orange): 1 source only (score 0.5-0.69)
 * - Very Low (red): Sources disagree or insufficient data (score < 0.5)
 */

import { useState } from 'react';

const CONFIDENCE_CONFIG = {
  high: {
    bgClass: 'bg-emerald-100',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-300',
    icon: '\u2713', // checkmark
    defaultLabel: 'High',
    minScore: 0.9,
  },
  medium: {
    bgClass: 'bg-amber-100',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-300',
    icon: '\u223C', // tilde
    defaultLabel: 'Medium',
    minScore: 0.7,
  },
  low: {
    bgClass: 'bg-orange-100',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-300',
    icon: '!',
    defaultLabel: 'Low',
    minScore: 0.5,
  },
  veryLow: {
    bgClass: 'bg-red-100',
    textClass: 'text-red-700',
    borderClass: 'border-red-300',
    icon: '?',
    defaultLabel: 'Very Low',
    minScore: 0,
  },
};

/**
 * Get confidence tier from score
 */
export function getConfidenceTier(score) {
  if (score >= 0.9) return 'high';
  if (score >= 0.7) return 'medium';
  if (score >= 0.5) return 'low';
  return 'veryLow';
}

/**
 * Get confidence label from score
 */
export function getConfidenceLabel(score) {
  const tier = getConfidenceTier(score);
  return CONFIDENCE_CONFIG[tier].defaultLabel;
}

export function ConfidenceBadge({
  score,
  tier, // Override tier if not using score
  label,
  tooltip,
  size = 'normal', // 'small' | 'normal' | 'large'
  showIcon = true,
  showScore = false,
}) {
  const [showTooltipState, setShowTooltipState] = useState(false);

  // Determine tier from score or use override
  const effectiveTier = tier || (score !== undefined ? getConfidenceTier(score) : 'veryLow');
  const config = CONFIDENCE_CONFIG[effectiveTier] || CONFIDENCE_CONFIG.veryLow;
  const displayLabel = label || config.defaultLabel;

  // Size variants
  const sizeClasses = {
    small: 'px-1.5 py-0.5 text-xs',
    normal: 'px-2.5 py-1 text-sm',
    large: 'px-3 py-1.5 text-base',
  };

  // Generate tooltip text if not provided
  const tooltipText = tooltip || (score !== undefined
    ? `Confidence: ${(score * 100).toFixed(0)}% - Based on ${getSourceCountDescription(score)}`
    : `Confidence: ${displayLabel}`);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowTooltipState(true)}
      onMouseLeave={() => setShowTooltipState(false)}
    >
      <span
        className={`
          inline-flex items-center gap-1
          ${sizeClasses[size]}
          ${config.bgClass}
          ${config.textClass}
          border ${config.borderClass}
          rounded-full font-medium
          select-none cursor-default
        `}
      >
        {showIcon && (
          <span className="font-bold">{config.icon}</span>
        )}
        {displayLabel}
        {showScore && score !== undefined && (
          <span className="opacity-75 ml-0.5">
            ({(score * 100).toFixed(0)}%)
          </span>
        )}
      </span>

      {/* Tooltip */}
      {showTooltipState && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48">
          <div className="bg-[#213448] text-white text-xs rounded-lg px-3 py-2 shadow-lg text-center">
            {tooltipText}
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#213448]" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper to describe source count based on score
 */
function getSourceCountDescription(score) {
  if (score >= 0.9) return '3+ sources agree';
  if (score >= 0.7) return '2 sources agree';
  if (score >= 0.5) return '1 source only';
  return 'sources disagree';
}

/**
 * ConfidenceBadgeInline - Minimal inline badge for tables
 */
export function ConfidenceBadgeInline({ score, tier }) {
  const effectiveTier = tier || (score !== undefined ? getConfidenceTier(score) : 'veryLow');
  const config = CONFIDENCE_CONFIG[effectiveTier] || CONFIDENCE_CONFIG.veryLow;

  return (
    <span
      className={`
        inline-flex items-center justify-center
        w-5 h-5 rounded-full text-xs font-bold
        ${config.bgClass} ${config.textClass}
      `}
      title={`Confidence: ${config.defaultLabel}${score !== undefined ? ` (${(score * 100).toFixed(0)}%)` : ''}`}
    >
      {config.icon}
    </span>
  );
}

/**
 * ConfidenceBadgeWithSources - Extended badge showing source list
 */
export function ConfidenceBadgeWithSources({
  score,
  sources = [],
  showAllSources = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const tier = getConfidenceTier(score);
  const config = CONFIDENCE_CONFIG[tier];

  const displaySources = showAllSources || expanded ? sources : sources.slice(0, 3);
  const hasMore = sources.length > 3 && !showAllSources;

  return (
    <div className={`
      p-3 rounded-lg border
      ${config.bgClass} ${config.borderClass}
    `}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`font-bold ${config.textClass}`}>
            {config.icon} {config.defaultLabel} Confidence
          </span>
          <span className={`text-sm ${config.textClass} opacity-75`}>
            ({(score * 100).toFixed(0)}%)
          </span>
        </div>
        <span className={`text-xs ${config.textClass}`}>
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Sources list */}
      {sources.length > 0 && (
        <div className="space-y-1">
          {displaySources.map((source, idx) => (
            <div
              key={idx}
              className={`text-sm ${config.textClass} opacity-90 flex items-center gap-2`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
              {source.domain || source.source || source}
              {source.value !== undefined && (
                <span className="opacity-75">: {source.value}</span>
              )}
            </div>
          ))}
          {hasMore && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className={`text-xs ${config.textClass} underline opacity-75 hover:opacity-100`}
            >
              +{sources.length - 3} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ConfidenceBadge;
