import React from 'react';

/**
 * ChartPanel - Standardized chart container with optional header.
 *
 * @param {{ title?: string, subtitle?: string, actions?: React.ReactNode, className?: string, children: React.ReactNode }} props
 */
export function ChartPanel({ title, subtitle, actions, className = '', children }) {
  const hasHeader = title || subtitle || actions;

  return (
    <div className={className}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm md:text-base font-semibold text-ink">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs md:text-sm text-ink-mid">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="shrink-0 flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export default ChartPanel;
