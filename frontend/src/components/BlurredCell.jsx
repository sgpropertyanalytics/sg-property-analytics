/**
 * BlurredCell - Production-grade component for protected data visualization
 *
 * SECURITY PRINCIPLE:
 * - Server returns masked values, NOT real values that get CSS-blurred
 * - `value` prop is null for non-authenticated users (server withholds it)
 * - `masked` prop contains pre-computed masked display value
 * - No client-side masking/blurring of real data
 *
 * Usage:
 * <BlurredCell
 *   value={txn.project_name}          // null for non-authenticated, real for authenticated
 *   masked={txn.project_name_masked}  // "D09 Condo A" (always present)
 *   field="project name"              // For analytics/CTA copy
 *   variant="label"                   // "label" | "currency" | "number"
 *   district={txn.district}           // Optional: for contextual CTA
 *   source="table"                    // "table" | "modal" | "chart"
 * />
 *
 * Props:
 * - value: Real value (null for non-authenticated users, actual for authenticated)
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
  field: _field = 'data',
  variant = 'label',
  district: _district = null,
  source: _source = 'table',
  className = '',
}) {
  const displayValue = value ?? masked;

  return (
    <span className={className}>
      {formatValue(displayValue, variant)}
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
