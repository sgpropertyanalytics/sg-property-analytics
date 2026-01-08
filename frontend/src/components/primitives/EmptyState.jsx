export default function EmptyState({ title = 'Nothing here yet', description, className = '', action }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}>
      <p className="text-sm font-medium text-mono-ink">{title}</p>
      {description ? <p className="text-sm text-mono-mid">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
