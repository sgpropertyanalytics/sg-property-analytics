/**
 * StencilLabel - Industrial warning/spec label component
 *
 * Inspired by 1970s-80s engineering manual labels:
 * - CAUTION:
 * - SPEC:
 * - REF:
 * - DATA:
 * - WARNING:
 */

export function StencilLabel({
  children,
  variant = 'vermillion',  // 'vermillion' | 'ink' | 'olive'
  className = '',
}) {
  const variantStyles = {
    vermillion: 'stencil-label',
    ink: 'stencil-label-ink',
    olive: 'font-brand text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-olive)] border border-dashed border-[var(--color-olive)] px-2.5 py-0.5 inline-block',
  };

  return (
    <span className={`${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}

/**
 * Common label presets
 */
export function SpecLabel({ children, ...props }) {
  return <StencilLabel {...props}>SPEC: {children}</StencilLabel>;
}

export function RefLabel({ children, ...props }) {
  return <StencilLabel {...props}>REF: {children}</StencilLabel>;
}

export function DataLabel({ children, ...props }) {
  return <StencilLabel {...props}>DATA: {children}</StencilLabel>;
}

export function CautionLabel({ children, ...props }) {
  return <StencilLabel {...props}>CAUTION: {children}</StencilLabel>;
}

export function WarningLabel({ children, ...props }) {
  return <StencilLabel {...props}>WARNING: {children}</StencilLabel>;
}

export default StencilLabel;
