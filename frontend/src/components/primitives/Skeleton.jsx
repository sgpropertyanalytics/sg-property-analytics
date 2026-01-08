export default function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse rounded bg-mono-muted/40 ${className}`}
      {...props}
    />
  );
}
