export default function Container({
  as: Component = 'div',
  className = '',
  padding = true,
  ...props
}) {
  const paddingClasses = padding ? 'px-4 md:px-6 lg:px-8' : '';
  return (
    <Component
      className={`mx-auto w-full max-w-content ${paddingClasses} ${className}`}
      {...props}
    />
  );
}
