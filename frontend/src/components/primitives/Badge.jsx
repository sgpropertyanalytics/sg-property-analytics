const VARIANT_CLASSES = {
  neutral: 'bg-brand-sand text-brand-blue',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-rose-100 text-rose-700',
};

export default function Badge({ variant = 'neutral', className = '', ...props }) {
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.neutral;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-mono uppercase tracking-wide ${variantClass} ${className}`}
      {...props}
    />
  );
}
