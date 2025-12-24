import { useSubscription } from '../context/SubscriptionContext';

/**
 * BlurredCell - Renders blurred or visible data based on subscription status
 *
 * Usage:
 * <BlurredCell value={txn.project_name} blurType="project" district={txn.district} />
 * <BlurredCell value={txn.price} blurType="price" />
 * <BlurredCell value={txn.psf} blurType="psf" />
 * <BlurredCell value={txn.area_sqft} blurType="size" />
 *
 * Blur Types:
 * - project: Shows "D09 Condo A" format (district visible, name masked)
 * - price: Shows "$2.5M - $3M" range
 * - psf: Shows "$2,000 - $2,500" range
 * - size: Shows "~1,200 sqft" rounded
 */
export function BlurredCell({
  value,
  blurType,
  district = null,
  className = '',
  onClick,
}) {
  const { isPremium, showPaywall } = useSubscription();

  // If premium user, show full value
  if (isPremium) {
    return <span className={className}>{formatValue(value, blurType)}</span>;
  }

  // For free users, show masked value with blur effect
  const maskedValue = getMaskedValue(value, blurType, district);

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) onClick();
    showPaywall();
  };

  return (
    <span
      className={`blur-[3px] cursor-pointer hover:blur-[2px] transition-all select-none ${className}`}
      onClick={handleClick}
      title="Subscribe to view full data"
    >
      {maskedValue}
    </span>
  );
}

/**
 * Format value for premium users (proper formatting)
 */
function formatValue(value, blurType) {
  if (value === null || value === undefined) return '-';

  switch (blurType) {
    case 'price':
      return `$${Number(value).toLocaleString()}`;
    case 'psf':
      return `$${Number(value).toLocaleString()}`;
    case 'size':
      return `${Number(value).toLocaleString()} sqft`;
    case 'project':
    default:
      return value;
  }
}

/**
 * Get masked value for free users
 */
function getMaskedValue(value, blurType, district) {
  if (value === null || value === undefined) return '-';

  switch (blurType) {
    case 'project':
      return getMaskedProject(value, district);
    case 'price':
      return getMaskedPrice(value);
    case 'psf':
      return getMaskedPsf(value);
    case 'size':
      return getMaskedSize(value);
    default:
      return value;
  }
}

/**
 * Mask project name - show district + generic label
 * Example: "D09 Condo A" instead of "RIVIERE"
 */
function getMaskedProject(projectName, district) {
  if (!projectName) return '-';

  // Use district if provided, otherwise extract from project name pattern
  const districtCode = district || 'D??';

  // Generate a consistent letter based on first char of project name
  const firstChar = projectName.charAt(0).toUpperCase();
  const letterIndex = firstChar.charCodeAt(0) % 26;
  const letter = String.fromCharCode(65 + letterIndex); // A-Z

  return `${districtCode} Condo ${letter}`;
}

/**
 * Mask price - show as range
 * Example: "$2,850,000" → "$2.5M - $3M"
 */
function getMaskedPrice(price) {
  if (!price || isNaN(price)) return '-';

  const millions = price / 1000000;

  if (millions < 1) {
    // Under $1M - show in $100K ranges
    const lowerBound = Math.floor(price / 100000) * 100000;
    const upperBound = lowerBound + 100000;
    return `$${(lowerBound / 1000).toFixed(0)}K - $${(upperBound / 1000).toFixed(0)}K`;
  } else if (millions < 5) {
    // $1M - $5M - show in $0.5M ranges
    const lowerBound = Math.floor(millions * 2) / 2;
    const upperBound = lowerBound + 0.5;
    return `$${lowerBound.toFixed(1)}M - $${upperBound.toFixed(1)}M`;
  } else {
    // $5M+ - show in $1M ranges
    const lowerBound = Math.floor(millions);
    const upperBound = lowerBound + 1;
    return `$${lowerBound}M - $${upperBound}M`;
  }
}

/**
 * Mask PSF - show as range
 * Example: "$2,156" → "$2,000 - $2,500"
 */
function getMaskedPsf(psf) {
  if (!psf || isNaN(psf)) return '-';

  // Round to nearest $500
  const lowerBound = Math.floor(psf / 500) * 500;
  const upperBound = lowerBound + 500;

  return `$${lowerBound.toLocaleString()} - $${upperBound.toLocaleString()}`;
}

/**
 * Mask size - show rounded value
 * Example: "1,184 sqft" → "~1,200 sqft"
 */
function getMaskedSize(size) {
  if (!size || isNaN(size)) return '-';

  // Round to nearest 100 sqft
  const rounded = Math.round(size / 100) * 100;
  return `~${rounded.toLocaleString()} sqft`;
}

export default BlurredCell;
