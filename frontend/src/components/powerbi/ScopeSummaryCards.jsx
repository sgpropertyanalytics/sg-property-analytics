/**
 * ScopeSummaryCards - Three-card comparison display for Deal Checker
 *
 * Shows percentile and key stats for three comparison scopes:
 * - Same Project: Observations in the exact same project
 * - Within 1km: Nearby projects within 1km radius
 * - Within 2km: Broader area within 2km radius
 */
import React from 'react';

// Format price for display
const formatPrice = (value) => {
  if (value === null || value === undefined) return '-';
  if (value >= 1000000) {
    const millions = value / 1000000;
    return `$${millions.toFixed(2)}M`;
  }
  return `$${(value / 1000).toFixed(0)}K`;
};

// Get interpretation config for percentile
const getInterpretationConfig = (interpretation) => {
  const configs = {
    excellent_deal: {
      label: 'Excellent Deal!',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      icon: '🎉'
    },
    good_deal: {
      label: 'Good Deal',
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
      icon: '👍'
    },
    fair_deal: {
      label: 'Fair Deal',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      icon: '👌'
    },
    above_average: {
      label: 'Above Average',
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      icon: '📊'
    },
    no_data: {
      label: 'No Data',
      color: 'text-slate-500',
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      icon: '❓'
    }
  };

  return configs[interpretation] || configs.no_data;
};

// Scope card configuration
const SCOPE_CONFIG = {
  same_project: {
    title: 'Same Development',
    description: 'Units sold in your exact project',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )
  },
  radius_1km: {
    title: 'Within 1km Radius',
    description: 'Nearby condos within walking distance',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  },
  radius_2km: {
    title: 'Within 2km Radius',
    description: 'Broader neighborhood comparison',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
};

export default function ScopeSummaryCards({
  scopes,
  activeScope,
  onScopeClick,
  bedroom
}) {
  if (!scopes) return null;

  const scopeKeys = ['same_project', 'radius_1km', 'radius_2km'];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {scopeKeys.map((scopeKey) => {
        const scope = scopes[scopeKey];
        const config = SCOPE_CONFIG[scopeKey];
        const isActive = activeScope === scopeKey;
        const percentile = scope?.percentile;
        const interpretation = getInterpretationConfig(percentile?.interpretation);
        const hasData = percentile && percentile.rank !== null && scope.transaction_count > 0;

        return (
          <button
            key={scopeKey}
            onClick={() => onScopeClick(scopeKey)}
            className={`
              relative p-4 rounded-lg border-2 text-left transition-all
              ${isActive
                ? `${interpretation.border} ${interpretation.bg} ring-2 ring-offset-1 ring-${interpretation.color.replace('text-', '')}`
                : 'border-[#94B4C1]/50 bg-white hover:border-[#547792]/50 hover:bg-slate-50'
              }
            `}
          >
            {/* Active indicator */}
            {isActive && (
              <div className="absolute top-2 right-2">
                <svg className="w-5 h-5 text-[#213448]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            )}

            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[#547792]">{config.icon}</span>
              <span className="font-semibold text-[#213448] text-sm">{config.title}</span>
            </div>

            {hasData ? (
              <>
                {/* Interpretation badge */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-lg">{interpretation.icon}</span>
                  <span className={`font-semibold ${interpretation.color}`}>
                    {interpretation.label}
                  </span>
                </div>

                {/* Percentile */}
                <div className="text-2xl font-bold text-[#213448] mb-1">
                  {percentile.rank}%
                  <span className="text-xs font-normal text-[#547792] ml-1">percentile</span>
                </div>

                {/* Stats */}
                <div className="text-xs text-[#547792] space-y-0.5">
                  <div className="flex justify-between">
                    <span>Median Price:</span>
                    <span className="font-medium text-[#213448]">
                      {formatPrice(scope.median_price)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{bedroom}BR Observations:</span>
                    <span className="font-medium text-[#213448]">
                      {scope.transaction_count?.toLocaleString() || 0}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-2">
                <span className="text-2xl">❓</span>
                <p className="text-sm text-[#547792] mt-1">
                  No {bedroom}BR transactions
                </p>
              </div>
            )}

            {/* Description */}
            <p className="text-[10px] text-[#94B4C1] mt-2">{config.description}</p>
          </button>
        );
      })}
    </div>
  );
}
