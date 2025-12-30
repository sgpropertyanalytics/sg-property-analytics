/**
 * VerificationBadge - Simple inline indicator for verification status.
 *
 * Shows a small colored dot/icon based on verification status and confidence:
 * - Green checkmark: Verified (confirmed by multiple sources)
 * - Yellow warning: Mismatch (needs review)
 * - Gray dash: Unverified (not yet checked)
 */

const STATUS_CONFIG = {
  confirmed: {
    bgClass: 'bg-emerald-500',
    icon: '\u2713',
    label: 'Verified',
  },
  mismatch: {
    bgClass: 'bg-amber-500',
    icon: '!',
    label: 'Mismatch',
  },
  unverified: {
    bgClass: 'bg-gray-400',
    icon: '\u2014',
    label: 'Unverified',
  },
};

/**
 * VerificationBadge - Minimal dot indicator for tables
 */
export function VerificationBadge({ status, confidence }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unverified;

  const tooltip = confidence !== undefined
    ? `${config.label} (${(confidence * 100).toFixed(0)}% confidence)`
    : config.label;

  return (
    <span
      className={`
        inline-flex items-center justify-center
        w-5 h-5 rounded-full text-xs font-bold text-white
        ${config.bgClass}
      `}
      title={tooltip}
    >
      {config.icon}
    </span>
  );
}

export default VerificationBadge;
