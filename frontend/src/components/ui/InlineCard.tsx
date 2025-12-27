import React from 'react';

/**
 * InlineCard - Compact KPI card for use INSIDE chart components
 *
 * NOT to be confused with KPICard/KPICardV2 which are standalone cards
 * used on pages like Market Pulse and Supply Inventory.
 *
 * Bloomberg-style anatomy:
 * ┌────────────────────────┐
 * │ LABEL (uppercase)      │  ← 10px, tracking-wide
 * │ $1,234,567             │  ← value row, mono, nowrap
 * │ +5.2% vs prev          │  ← optional subtext
 * └────────────────────────┘
 *
 * Usage:
 *   <InlineCard label="Median" value="$1.85M" />
 *   <InlineCard label="CCR" value="$2,450" subtext="+3.2% vs prev" color="#213448" />
 *   <InlineCard label="Q1-Q3" value="$1.22M – $2.27M" />
 */

interface InlineCardProps {
  /** Label displayed at top (auto-uppercased) */
  label: string;
  /** Main value - displayed with mono font, nowrap */
  value: string | number;
  /** Optional subtext below value */
  subtext?: string;
  /** Optional accent color for label and background tint (ignored when variant is set) */
  color?: string;
  /** Trend direction for subtext styling */
  trend?: 'up' | 'down' | 'neutral';
  /** Visual variant for alert states */
  variant?: 'default' | 'warning' | 'danger';
  /** Size variant - compact for tighter layouts like PriceDistributionChart */
  size?: 'default' | 'compact';
  /** Loading state */
  loading?: boolean;
  /** Additional className */
  className?: string;
}

export function InlineCard({
  label,
  value,
  subtext,
  color,
  trend,
  variant = 'default',
  size = 'default',
  loading = false,
  className = '',
}: InlineCardProps) {
  // Subtext color based on trend (price context: up = good/green, down = bad/red for PSF)
  const getSubtextColor = () => {
    if (variant === 'warning') return 'text-amber-700 font-semibold';
    if (variant === 'danger') return 'text-red-700 font-semibold';
    if (!trend) return 'text-[#547792]';
    switch (trend) {
      case 'up':
        return 'text-emerald-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-[#547792]';
    }
  };

  // Variant-based styling
  const getVariantStyles = () => {
    switch (variant) {
      case 'warning':
        return {
          container: 'bg-amber-100 border-2 border-amber-400',
          label: 'text-amber-800 font-bold',
          value: 'text-amber-900',
        };
      case 'danger':
        return {
          container: 'bg-red-50 border-2 border-red-500',
          label: 'text-red-800 font-bold',
          value: 'text-red-900',
        };
      default:
        return {
          container: '',
          label: 'text-[#547792]',
          value: 'text-[#213448]',
        };
    }
  };

  const variantStyles = getVariantStyles();

  // Size-based styling
  const sizeStyles = {
    default: {
      container: 'rounded-lg px-3 py-2',
      value: 'text-lg md:text-xl font-bold',
    },
    compact: {
      container: 'rounded px-2 sm:px-2.5 py-1.5',
      value: 'text-xs sm:text-sm font-semibold',
    },
  };
  const currentSize = sizeStyles[size];

  // Background and label color (only for default variant)
  const bgStyle = variant === 'default'
    ? (color
        ? { backgroundColor: `${color}10` }
        : { backgroundColor: 'rgba(33, 52, 72, 0.05)' }) // #213448 at 5%
    : undefined;

  const labelStyle = variant === 'default' && color ? { color } : undefined;

  if (loading) {
    return (
      <div className={`${currentSize.container} ${className}`} style={bgStyle}>
        <div className="h-3 w-12 bg-[#94B4C1]/30 rounded animate-pulse mb-1" />
        <div className="h-5 w-20 bg-[#94B4C1]/30 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className={`${currentSize.container} ${variantStyles.container} ${className}`}
      style={bgStyle}
    >
      {/* Label row - uppercase, tracking-wide */}
      <div
        className={`text-[10px] uppercase tracking-wide ${variantStyles.label}`}
        style={labelStyle}
      >
        {label}
      </div>

      {/* Value row - mono, tabular-nums, nowrap */}
      <div className={`${currentSize.value} font-mono tabular-nums whitespace-nowrap ${variantStyles.value}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>

      {/* Optional subtext row */}
      {subtext && (
        <div className={`text-[10px] font-medium whitespace-nowrap ${getSubtextColor()}`}>
          {subtext}
        </div>
      )}
    </div>
  );
}

/**
 * InlineCardGroup - Grid wrapper for InlineCards
 *
 * Responsive: 1 column on mobile, specified columns on sm+
 */
interface InlineCardGroupProps {
  children: React.ReactNode;
  /** Number of columns on sm+ screens */
  columns?: 2 | 3 | 4;
  /** Blur for non-premium users */
  blur?: boolean;
  className?: string;
}

export function InlineCardGroup({
  children,
  columns = 3,
  blur = false,
  className = '',
}: InlineCardGroupProps) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  };

  return (
    <div
      className={`
        grid gap-2 sm:gap-3 mt-3
        ${gridCols[columns]}
        ${blur ? 'blur-sm grayscale-[40%]' : ''}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

export default InlineCard;
