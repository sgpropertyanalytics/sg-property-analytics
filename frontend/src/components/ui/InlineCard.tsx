import React from 'react';
import { FrostOverlay } from '../common/loading';

/**
 * InlineCard - Financial Terminal KPI card for use INSIDE chart components
 *
 * NOT to be confused with KPICard/KPICardV2 which are standalone cards
 * used on pages like Market Pulse and Supply Inventory.
 *
 * Design Philosophy (3-Layer Card System):
 * - Individual gray backgrounds per stat (visual grouping)
 * - Status shown via pills/badges (scannable)
 * - Monospace numbers (JetBrains Mono for precision feel)
 *
 * Layout:
 * ┌─────────────────────────┐
 * │  LABEL                  │  ← small, muted
 * │  $1,234,567             │  ← dominant mono
 * │  [+5.2% above avg]      │  ← pill badge
 * └─────────────────────────┘
 *
 * Key Rules:
 * 1. Information hierarchy is FIXED: Label → Value → Context
 * 2. Numbers NEVER wrap (whitespace-nowrap + tabular-nums)
 * 3. Grid controls size, NOT content (minmax prevents too-narrow cards)
 * 4. Truncate with tooltip when content overflows
 *
 * Usage:
 *   <InlineCard label="Median" value="$1.85M" />
 *   <InlineCard label="CCR" value="$2,450" subtext="+3.2% vs prev" />
 */

interface InlineCardProps {
  /** Label displayed at top (auto-uppercased, truncates if too long) */
  label: string;
  /** Main value - displayed with mono font, never wraps, truncates with tooltip */
  value: string | number;
  /** Optional context/subtext below value */
  subtext?: string;
  /** Optional accent color for label (background is always clean) */
  color?: string;
  /** Trend direction for subtext styling */
  trend?: 'up' | 'down' | 'neutral';
  /** Visual variant for alert states */
  variant?: 'default' | 'success' | 'warning' | 'danger';
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

  // Get pill styling based on trend (for status badges)
  // Pills are small, scannable badges that break up text heaviness
  const getPillStyles = () => {
    if (variant === 'success') {
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
    if (variant === 'warning') {
      return 'bg-amber-100 text-amber-700 border-amber-200';
    }
    if (variant === 'danger') {
      return 'bg-red-100 text-red-700 border-red-200';
    }
    if (!trend) return 'bg-slate-100 text-slate-600 border-slate-200';
    switch (trend) {
      case 'up':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'down':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  // Variant-based styling - clean backgrounds, no nested boxes
  // Alert states use subtle left border accent instead of heavy backgrounds
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return {
          container: 'border-l-2 border-l-emerald-500 pl-3',
          label: 'text-emerald-700 font-semibold',
          value: 'text-emerald-900',
        };
      case 'warning':
        return {
          container: 'border-l-2 border-l-amber-500 pl-3',
          label: 'text-amber-700 font-semibold',
          value: 'text-amber-900',
        };
      case 'danger':
        return {
          container: 'border-l-2 border-l-red-500 pl-3',
          label: 'text-red-700 font-semibold',
          value: 'text-red-900',
        };
      default:
        return {
          container: '',
          label: 'text-[#64748b]',  // slate-500 for labels
          value: 'text-[#0f172a]',  // slate-900 for numbers
        };
    }
  };

  const variantStyles = getVariantStyles();
  const pillStyles = getPillStyles();

  // Size-based styling with individual gray backgrounds
  // Weapon aesthetic: rounded-none for hard edges
  const sizeStyles = {
    default: {
      container: 'rounded-none px-4 py-3',
      value: 'text-lg md:text-xl font-medium',  // medium weight for JetBrains Mono
    },
    compact: {
      container: 'rounded-none px-3 py-2',
      value: 'text-sm md:text-base font-medium',  // medium weight for JetBrains Mono
    },
  };
  const currentSize = sizeStyles[size];

  // Background color - individual gray backgrounds for visual grouping
  // Only applies to default variant (alert variants have their own styling)
  const bgStyle = variant === 'default'
    ? { backgroundColor: 'rgba(15, 23, 42, 0.05)' } // slate-900 at 5% - subtle gray
    : undefined;

  // Label uses the color prop for accent if provided
  const labelStyle = color ? { color } : undefined;

  if (loading) {
    return (
      <div className={`${currentSize.container} ${className} overflow-hidden`} style={bgStyle}>
        <FrostOverlay height={60} showSpinner={false} showProgress />
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

      {/* Layer 3: Context/Subtext - as pill badge for scannability */}
      {subtext && (
        <div
          className={`inline-flex items-center mt-1 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide whitespace-nowrap rounded-sm border ${pillStyles}`}
          title={subtext}
        >
          {subtext}
        </div>
      )}
    </div>
  );
}

/**
 * InlineCardRow - Responsive grid for inline stat cards
 *
 * Uses CSS Grid auto-fit for responsive layouts.
 * Cards now have NO background (financial terminal aesthetic).
 * Visual separation comes from whitespace and card content.
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
        ${compact ? 'gap-2 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]' : 'gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]'}
        ${blur ? 'blur-sm grayscale-[40%]' : ''}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

export default InlineCard;
