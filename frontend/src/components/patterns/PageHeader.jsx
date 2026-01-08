import React from 'react';

/**
 * PageHeader - Standardized dashboard header for title + metadata.
 *
 * @param {{ title: string, subtitle?: React.ReactNode, children?: React.ReactNode }} props
 */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-4 md:mb-6">
      <div className="min-w-0 mb-2">
        <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-ink hidden lg:block">
          {title}
        </h1>
        {subtitle && (
          <div className="text-ink-mid text-xs md:text-sm italic">
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export default PageHeader;
