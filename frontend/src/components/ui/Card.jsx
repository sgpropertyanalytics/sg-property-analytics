/**
 * Reusable Card component for consistent styling across the application
 */
export function Card({ title, children, subtitle, className }) {
  return (
    <div className={`bg-white rounded-xl p-4 md:p-6 mb-6 shadow-md ${className || ''}`}>
      {title && (
        <div className="mb-4">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-1">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
