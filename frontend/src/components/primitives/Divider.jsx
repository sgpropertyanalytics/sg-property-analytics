export default function Divider({ className = '', ...props }) {
  return <hr className={`border-t border-mono-muted ${className}`} {...props} />;
}
