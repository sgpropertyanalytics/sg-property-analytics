import React from 'react';

/**
 * SectionCard - Reusable section wrapper with consistent styling
 *
 * Used in ValueParityPanel for New Launches and Resale sections
 * Provides:
 * - Consistent header with icon, title, subtitle, and count badge
 * - Card styling with border and rounded corners
 * - Content area with optional padding
 */
export function SectionCard({
  id,
  icon,
  title,
  subtitle,
  count,
  children,
  className = '',
  headerClassName = '',
  contentClassName = '',
  noPadding = false,
}) {
  return (
    <section
      id={id}
      className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden ${className}`}
    >
      {/* Section Header */}
      <div className={`px-4 py-3 border-b border-[#94B4C1]/30 bg-[#EAE0CF]/20 ${headerClassName}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon && (
              <span className="text-lg text-[#547792]">{icon}</span>
            )}
            <div>
              <h3 className="text-sm font-semibold text-[#213448]">{title}</h3>
              {subtitle && (
                <p className="text-xs text-[#547792]">{subtitle}</p>
              )}
            </div>
          </div>
          {count !== undefined && count !== null && (
            <span className="px-2 py-0.5 bg-[#213448]/10 text-[#213448] text-xs font-medium rounded-full">
              {typeof count === 'number' ? count.toLocaleString() : count}
            </span>
          )}
        </div>
      </div>

      {/* Section Content */}
      <div className={noPadding ? contentClassName : `p-4 ${contentClassName}`}>
        {children}
      </div>
    </section>
  );
}

export default SectionCard;
