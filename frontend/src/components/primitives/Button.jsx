const VARIANT_CLASSES = {
  primary: 'bg-brand-navy text-white hover:bg-brand-blue',
  secondary: 'border border-brand-blue text-brand-blue hover:bg-brand-sand/40',
  ghost: 'text-brand-blue hover:bg-brand-sand/30',
};

export default function Button({
  as: Component = 'button',
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}) {
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary;

  return (
    <Component
      type={Component === 'button' ? type : undefined}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out ${variantClass} ${className}`}
      {...props}
    />
  );
}
