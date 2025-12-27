import React from 'react';

/**
 * InlineCard - Bloomberg-style KPI card for use INSIDE chart components
 *
 * NOT to be confused with KPICard/KPICardV2 which are standalone cards
 * used on pages like Market Pulse and Supply Inventory.
 *
 * Bloomberg Layout Rules:
 * ┌──────────────────────────────────────┐
 * │  LABEL                               │  ← small, muted, 1 line, truncate
 * │  $1,234,567                          │  ← dominant, never wraps, truncate
 * │  +5.2% vs prev                       │  ← optional context, lighter
 * └──────────────────────────────────────┘
 *
 * Key Rules:
 * 1. Information hierarchy is FIXED: Label → Value → Context
 * 2. Numbers NEVER wrap (whitespace-nowrap + tabular-nums)
 * 3. Grid controls size, NOT content (minmax prevents too-narrow cards)
 * 4. Truncate with tooltip when content overflows
 * 5. Standard padding (px-4 py-3) ensures values never "kiss the edge"
 *
 * Usage:
 *   <InlineCard label="Median" value="$1.85M" />
 *   <InlineCard label="CCR" value="$2,450" subtext="+3.2% vs prev" color="#213448" />
 *   <InlineCard label="Q1-Q3" value="$1.22M – $2.27M" />
 */

interface InlineCardProps {
  /** Label displayed at top (auto-uppercased, truncates if too long) */
  label: string;
  /** Main value - displayed with mono font, never wraps, truncates with tooltip */
  value: string | number;
  /** Optional context/subtext below value */
  subtext?: string;
  /** Optional accent color for label and background tint (ignored when variant is set) */
  color?: string;
  /** Trend direction for subtext styling */
  trend?: 'up' | 'down' | 'neutral';
  /** Visual variant for alert states */
  variant?: 'default' | 'warning' | 'danger';
  /** Size variant - compact for tighter layouts */
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
  // Format value for display
  const displayValue = typeof value === 'number' ? value.toLocaleString() : value;

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
  // Default: px-4 py-3 (Bloomberg standard padding)
  // Compact: px-3 py-2 (for tighter layouts, still respects min-width)
  const sizeStyles = {
    default: {
      container: 'rounded-lg px-4 py-3',
      value: 'text-lg md:text-xl font-bold',
    },
    compact: {
      container: 'rounded-lg px-3 py-2',
      value: 'text-sm md:text-base font-semibold',
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
        <div className="h-3 w-16 bg-[#94B4C1]/30 rounded animate-pulse mb-1.5" />
        <div className="h-6 w-24 bg-[#94B4C1]/30 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className={`min-w-0 ${currentSize.container} ${variantStyles.container} ${className}`}
      style={bgStyle}
    >
      {/* Layer 1: Label - small, muted, 1 line, truncate */}
      <div
        className={`text-[10px] uppercase tracking-wide truncate ${variantStyles.label}`}
        style={labelStyle}
        title={label}
      >
        {label}
      </div>

      {/* Layer 2: Value - dominant, never wraps, truncate with tooltip */}
      <div
        className={`${currentSize.value} font-mono tabular-nums whitespace-nowrap truncate ${variantStyles.value}`}
        title={displayValue}
      >
        {displayValue}
      </div>

      {/* Layer 3: Context/Subtext - optional, lighter, 1 line */}
      {subtext && (
        <div
          className={`text-[10px] font-medium whitespace-nowrap truncate ${getSubtextColor()}`}
          title={subtext}
        >
          {subtext}
        </div>
      )}
    </div>
  );
}

/**
 * InlineCardGroup - True auto-grid wrapper for InlineCards
 *
 * Bloomberg Layout Rules:
 * ✅ Uses auto-fit (auto packs items horizontally)
 * ✅ Uses minmax(280px, 1fr) (prevents cards from getting too narrow)
 * ✅ No fixed column count (layout adapts automatically)
 * ✅ No media queries (responsive by design)
 *
 * This is the ONLY layout that behaves like Bloomberg dashboards.
 */
interface InlineCardGroupProps {
  children: React.ReactNode;
  /** Blur for non-premium users */
  blur?: boolean;
  /** Additional className */
  className?: string;
}

export function InlineCardGroup({
  children,
  blur = false,
  className = '',
}: InlineCardGroupProps) {
  return (
    <div
      className={`
        grid gap-4 mt-3
        [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]
        ${blur ? 'blur-sm grayscale-[40%]' : ''}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

/**
 * InlineCardRow - Compact auto-grid for tighter layouts
 *
 * Same as InlineCardGroup but with smaller minmax (200px) for compact cards.
 * Use for charts with many small stats (e.g., PriceDistributionChart).
 */
interface InlineCardRowProps {
  children: React.ReactNode;
  /** Blur for non-premium users */
  blur?: boolean;
  /** Additional className */
  className?: string;
  /** Smaller gap for compact layouts */
  compact?: boolean;
}

export function InlineCardRow({
  children,
  blur = false,
  className = '',
  compact = false,
}: InlineCardRowProps) {
  return (
    <div
      className={`
        grid mt-3
        ${compact ? 'gap-2 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]' : 'gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]'}
        ${blur ? 'blur-sm grayscale-[40%]' : ''}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

export default InlineCard;
