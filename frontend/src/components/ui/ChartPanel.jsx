import React from 'react';

/**
 * ChartPanel - Standardized chart container with optional header.
 *
 * Supports ref forwarding for IntersectionObserver-based visibility detection
 * (e.g., useInView from react-intersection-observer for lazy data fetching).
 *
 * @param {{ title?: string, subtitle?: string, actions?: React.ReactNode, className?: string, children: React.ReactNode }} props
 */
export const ChartPanel = React.forwardRef(function ChartPanel({ title, subtitle, actions, className = '', children }, ref) {
  const hasHeader = title || subtitle || actions;

  return (
    <div ref={ref} className={className}>
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
});

export default ChartPanel;
