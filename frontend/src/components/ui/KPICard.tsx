import React, { ReactNode } from 'react';

/**
 * KPICard - Responsive stat/metric card
 *
 * Following responsive-layout-system skill:
 * - Desktop-first: Largest padding/text, then scale down
 * - Always visible, adapts sizing per breakpoint
 * - Touch targets >= 44px when clickable
 *
 * Breakpoint behavior:
 * - Desktop (1440px+): Full padding, large text
 * - Tablet (768-1023px): Medium padding
 * - Mobile (< 768px): Compact padding, smaller text
 */

interface KPICardProps {
  /** KPI title/label */
  title: string;
  /** The main value to display */
  value: string | number;
  /** Optional subtitle (e.g., "past 30 days") */
  subtitle?: string;
  /** Optional icon element */
  icon?: ReactNode;
  /** Loading state - shows skeleton */
  loading?: boolean;
  /** Click handler - makes the card interactive */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Trend indicator */
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  /** Card variant */
  variant?: 'default' | 'highlighted' | 'muted';
}

export function KPICard({
  title,
  value,
  subtitle,
  icon,
  loading,
  onClick,
  className = '',
  trend,
  variant = 'default',
}: KPICardProps) {
  const isInteractive = !!onClick;

  const variantClasses = {
    default: 'bg-card border-[#94B4C1]/50',
    highlighted: 'bg-[#213448] border-[#213448] text-white',
    muted: 'bg-[#EAE0CF]/50 border-[#94B4C1]/30',
  };

  const textColors = {
    default: {
      title: 'text-[#547792]',
      subtitle: 'text-[#94B4C1]',
      value: 'text-[#213448]',
      icon: 'text-[#94B4C1]',
    },
    highlighted: {
      title: 'text-[#94B4C1]',
      subtitle: 'text-[#94B4C1]/70',
      value: 'text-white',
      icon: 'text-[#94B4C1]',
    },
    muted: {
      title: 'text-[#547792]',
      subtitle: 'text-[#94B4C1]',
      value: 'text-[#213448]/70',
      icon: 'text-[#94B4C1]',
    },
  };

  const colors = textColors[variant];

  return (
    <div
      className={`
        rounded-lg border
        p-3 md:p-4 lg:p-5
        ${variantClasses[variant]}
        ${isInteractive ? 'cursor-pointer hover:shadow-md hover:border-[#547792] transition-all min-h-[44px]' : ''}
        ${className}
      `.trim()}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={isInteractive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      } : undefined}
    >
      {/* Header row: title + icon */}
      <div className="flex items-center justify-between mb-1.5 md:mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-xs md:text-sm ${colors.title} truncate`}>
            {title}
          </span>
          {subtitle && (
            <span className={`text-[10px] md:text-xs italic ${colors.subtitle} truncate hidden sm:inline`}>
              {subtitle}
            </span>
          )}
        </div>
        {icon && (
          <span className={`flex-shrink-0 ${colors.icon}`}>
            {icon}
          </span>
        )}
      </div>

      {/* Mobile subtitle (shown on separate line on small screens) */}
      {subtitle && (
        <span className={`text-[10px] italic ${colors.subtitle} block sm:hidden mb-1`}>
          {subtitle}
        </span>
      )}

      {/* Value */}
      {loading ? (
        <div className="h-7 md:h-8 bg-[#94B4C1]/30 rounded animate-pulse" />
      ) : (
        <div className={`text-xl md:text-2xl lg:text-3xl font-bold ${colors.value} leading-tight`}>
          {value}
        </div>
      )}

      {/* Trend indicator */}
      {trend && !loading && (
        <div className="mt-1.5 md:mt-2 flex items-center gap-1.5">
          <TrendBadge
            value={trend.value}
            direction={trend.direction}
            variant={variant}
          />
          {trend.label && (
            <span className={`text-[10px] md:text-xs ${colors.subtitle}`}>
              {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface TrendBadgeProps {
  value: number;
  direction: 'up' | 'down' | 'neutral';
  variant: 'default' | 'highlighted' | 'muted';
}

function TrendBadge({ value, direction, variant }: TrendBadgeProps) {
  const isHighlighted = variant === 'highlighted';

  const colors = {
    up: isHighlighted ? 'text-green-300 bg-green-900/30' : 'text-green-600 bg-green-100',
    down: isHighlighted ? 'text-red-300 bg-red-900/30' : 'text-red-600 bg-red-100',
    neutral: isHighlighted ? 'text-[#94B4C1] bg-[#547792]/30' : 'text-[#547792] bg-[#94B4C1]/20',
  };

  const icons = {
    up: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ),
    down: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    ),
    neutral: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    ),
  };

  const formattedValue = Math.abs(value).toFixed(1);

  return (
    <span className={`
      inline-flex items-center gap-0.5
      px-1.5 py-0.5
      rounded-full text-[10px] md:text-xs font-medium
      ${colors[direction]}
    `}>
      {icons[direction]}
      <span>{formattedValue}%</span>
    </span>
  );
}

/**
 * KPICardSkeleton - Placeholder while loading
 */
export function KPICardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`
      bg-card rounded-lg border border-[#94B4C1]/50
      p-3 md:p-4 lg:p-5
      animate-pulse
      ${className}
    `}>
      <div className="flex items-center justify-between mb-2">
        <div className="h-4 bg-[#94B4C1]/30 rounded w-1/2" />
        <div className="w-5 h-5 bg-[#94B4C1]/20 rounded" />
      </div>
      <div className="h-8 bg-[#94B4C1]/30 rounded w-2/3" />
    </div>
  );
}

/**
 * KPICardGroup - Wrapper for consistent spacing
 */
export function KPICardGroup({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`
      grid gap-3 md:gap-4
      grid-cols-2 md:grid-cols-3 lg:grid-cols-4
      ${className}
    `}>
      {children}
    </div>
  );
}

export default KPICard;
