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
      className={`${currentSize.container} ${variantStyles.container} ${className}`}
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
 * InlineCardGroup - Grid wrapper for InlineCards
 *
 * Bloomberg Layout Rule: Grid controls size, NOT content.
 * Uses minmax(200px, 1fr) to prevent cards from becoming too narrow.
 *
 * On mobile (<640px): Stack vertically (1 column)
 * On tablet+: Auto-fit with min-width constraint
 */
interface InlineCardGroupProps {
  children: React.ReactNode;
  /** Minimum card width in pixels (default: 200px) */
  minCardWidth?: number;
  /** Blur for non-premium users */
  blur?: boolean;
  /** Additional className */
  className?: string;
}

export function InlineCardGroup({
  children,
  minCardWidth = 200,
  blur = false,
  className = '',
}: InlineCardGroupProps) {
  // Use inline style for dynamic minmax value
  // Mobile: single column stack
  // Tablet+: auto-fit grid with minmax constraint
  const gridStyle = {
    display: 'grid',
    gap: '0.5rem', // gap-2
  };

  return (
    <div
      className={`
        grid gap-2 sm:gap-3 mt-3
        grid-cols-1
        ${blur ? 'blur-sm grayscale-[40%]' : ''}
        ${className}
      `.trim()}
      style={{
        // Override grid-template-columns on sm+ screens via CSS custom property
        // Fallback to single column on mobile via the className above
      }}
    >
      <style>{`
        @media (min-width: 640px) {
          .inline-card-grid-${minCardWidth} {
            grid-template-columns: repeat(auto-fit, minmax(${minCardWidth}px, 1fr)) !important;
          }
        }
      `}</style>
      <div
        className={`
          contents sm:grid sm:gap-3
          inline-card-grid-${minCardWidth}
          [&>*]:mb-2 sm:[&>*]:mb-0
        `.trim()}
        style={{
          display: 'contents',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * InlineCardRow - Simple fixed-column grid for inline cards
 *
 * Use when you know the exact number of cards and want fixed columns.
 * Falls back to stacked layout on mobile.
 */
interface InlineCardRowProps {
  children: React.ReactNode;
  /** Number of columns on sm+ screens */
  columns?: 2 | 3 | 4;
  /** Blur for non-premium users */
  blur?: boolean;
  /** Additional className */
  className?: string;
}

export function InlineCardRow({
  children,
  columns = 3,
  blur = false,
  className = '',
}: InlineCardRowProps) {
  // Fixed column layouts with minmax to prevent too-narrow cards
  // Mobile: 1 col (or 2 for 4-column layout)
  // Tablet+: specified columns
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
