import { useSubscription } from '../context/SubscriptionContext';

/**
 * BlurredCell - Production-grade component for premium data visualization
 *
 * SECURITY PRINCIPLE:
 * - Server returns masked values, NOT real values that get CSS-blurred
 * - `value` prop is null for free users (server withholds it)
 * - `masked` prop contains pre-computed masked display value
 * - No client-side masking/blurring of real data
 *
 * Usage:
 * <BlurredCell
 *   value={txn.project_name}          // null for free, real for premium
 *   masked={txn.project_name_masked}  // "D09 Condo A" (always present)
 *   field="project name"              // For analytics/CTA copy
 *   variant="label"                   // "label" | "currency" | "number"
 *   district={txn.district}           // Optional: for contextual CTA
 *   source="table"                    // "table" | "modal" | "chart"
 * />
 *
 * Props:
 * - value: Real value (null for free users, actual for premium)
 * - masked: Pre-computed masked display value from server
 * - field: Human-readable field name for analytics ("project name", "price")
 * - variant: Display variant - "label" | "currency" | "number"
 * - district: Optional district for contextual upgrade CTA
 * - source: Where the cell is rendered (for analytics)
 * - className: Additional CSS classes
 */

// Format value based on variant type
function formatValue(value, variant) {
  if (value === null || value === undefined) return '-';

  switch (variant) {
    case 'currency':
      return `$${Number(value).toLocaleString()}`;
    case 'number':
      return Number(value).toLocaleString();
    case 'area':
      return `${Number(value).toLocaleString()} sqft`;
    case 'label':
    default:
      return value;
  }
}

export function BlurredCell({
  value,
  masked,
  field = 'data',
  variant = 'label',
  district = null,
  source = 'table',
  className = '',
}) {
  const { isPremium, showPaywall } = useSubscription();

  // Premium users see the real value (formatted)
  if (isPremium && value !== null && value !== undefined) {
    return (
      <span className={className}>
        {formatValue(value, variant)}
      </span>
    );
  }

  // Free users see the masked value with blur effect and upgrade prompt
  const displayValue = masked || '-';

  // Handle click - triggers paywall with analytics context
  const handleClick = (e) => {
    e.stopPropagation();
    showPaywall({
      field,
      source,
      district,
    });
  };

  // Handle keyboard - Enter/Space triggers same as click (a11y)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };

  // Build contextual tooltip
  const tooltipText = district
    ? `Unlock exact ${field} for ${district} transactions`
    : `Unlock exact ${field}`;

  return (
    <span
      className={`relative inline-flex items-center gap-1 cursor-pointer group ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${displayValue} - ${tooltipText}`}
      title={tooltipText}
    >
      {/* Masked value with blur effect */}
      <span className="blur-[3px] group-hover:blur-[2px] transition-all select-none">
        {displayValue}
      </span>

      {/* PRO badge - visible on hover */}
      <span
        className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity
                   bg-[#213448] text-white text-[8px] font-bold px-1 py-0.5 rounded
                   pointer-events-none"
        aria-hidden="true"
      >
        PRO
      </span>
    </span>
  );
}

/**
 * BlurredCurrency - Convenience wrapper for currency values
 *
 * Usage:
 * <BlurredCurrency value={txn.price} masked={txn.price_masked} field="price" />
 */
export function BlurredCurrency({ value, masked, field = 'price', ...props }) {
  return (
    <BlurredCell
      value={value}
      masked={masked}
      field={field}
      variant="currency"
      {...props}
    />
  );
}

/**
 * BlurredArea - Convenience wrapper for area values
 *
 * Usage:
 * <BlurredArea value={txn.area_sqft} masked={txn.area_sqft_masked} />
 */
export function BlurredArea({ value, masked, field = 'size', ...props }) {
  return (
    <BlurredCell
      value={value}
      masked={masked}
      field={field}
      variant="area"
      {...props}
    />
  );
}

/**
 * BlurredPSF - Convenience wrapper for PSF values
 *
 * Usage:
 * <BlurredPSF value={txn.psf} masked={txn.psf_masked} />
 */
export function BlurredPSF({ value, masked, field = 'PSF', ...props }) {
  return (
    <BlurredCell
      value={value}
      masked={masked}
      field={field}
      variant="currency"
      {...props}
    />
  );
}

/**
 * BlurredProject - Convenience wrapper for project names
 *
 * Usage:
 * <BlurredProject value={txn.project_name} masked={txn.project_name_masked} district={txn.district} />
 */
export function BlurredProject({ value, masked, district, field = 'project name', ...props }) {
  return (
    <BlurredCell
      value={value}
      masked={masked}
      field={field}
      variant="label"
      district={district}
      {...props}
    />
  );
}

export default BlurredCell;
