export default function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full border border-mono-muted bg-transparent px-3 py-2 text-sm text-mono-ink placeholder:text-mono-light focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue ${className}`}
      {...props}
    />
  );
}
