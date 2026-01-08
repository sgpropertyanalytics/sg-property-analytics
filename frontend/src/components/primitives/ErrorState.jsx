export default function ErrorState({ title = 'Something went wrong', description, className = '', action }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}>
      <p className="text-sm font-semibold text-red-600">{title}</p>
      {description ? <p className="text-sm text-mono-mid">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
