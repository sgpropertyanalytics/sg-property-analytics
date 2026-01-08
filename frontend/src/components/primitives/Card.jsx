export default function Card({ as: Component = 'div', className = '', ...props }) {
  return (
    <Component
      className={`border border-mono-muted bg-card text-mono-ink ${className}`}
      {...props}
    />
  );
}
