/**
 * IndustrialCard - Hard-edge card component for Analog Industrial aesthetic
 *
 * Features:
 * - No rounded corners (brutalist)
 * - Registration marks in corners
 * - Monospace header label
 * - Three variants: default, dark, accent
 */

export function IndustrialCard({
  children,
  label,                    // "SPEC:" / "REF:" / "DATA:" header
  variant = 'default',      // 'default' | 'dark' | 'accent'
  className = '',
  noPadding = false,
}) {
  const baseStyles = 'relative';

  const variantStyles = {
    default: 'industrial-card',
    dark: 'industrial-card-dark',
    accent: 'industrial-card-accent',
  };

  const labelColors = {
    default: 'text-[var(--color-ink-muted)] border-[var(--color-border-hard)]',
    dark: 'text-[var(--color-paper)]/60 border-[var(--color-paper)]/20',
    accent: 'text-[var(--color-vermillion)] border-[var(--color-vermillion)]/30',
  };

  return (
    <div className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
      {/* Registration marks */}
      <div className="absolute -top-[2px] -left-[2px] w-3 h-3 border-t border-l border-[var(--color-ink)]/30" />
      <div className="absolute -bottom-[2px] -right-[2px] w-3 h-3 border-b border-r border-[var(--color-ink)]/30" />

      {/* Label header */}
      {label && (
        <div className={`font-brand text-[10px] font-bold tracking-[0.15em] uppercase px-4 py-2 border-b ${labelColors[variant]}`}>
          {label}
        </div>
      )}

      {/* Content */}
      <div className={noPadding ? '' : 'p-4 md:p-6'}>
        {children}
      </div>
    </div>
  );
}

/**
 * IndustrialCardHeader - Standalone header when IndustrialCard wrapper isn't suitable
 */
export function IndustrialCardHeader({ children, variant = 'default' }) {
  const labelColors = {
    default: 'text-[var(--color-ink-muted)] border-[var(--color-border-hard)]',
    dark: 'text-[var(--color-paper)]/60 border-[var(--color-paper)]/20',
    accent: 'text-[var(--color-vermillion)] border-[var(--color-vermillion)]/30',
  };

  return (
    <div className={`font-brand text-[10px] font-bold tracking-[0.15em] uppercase px-4 py-2 border-b ${labelColors[variant]}`}>
      {children}
    </div>
  );
}

export default IndustrialCard;
