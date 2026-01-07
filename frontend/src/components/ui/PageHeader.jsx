import React from 'react';

/**
 * PageHeader - Universal header component for dashboard pages
 *
 * Layout:
 * - Left slot: Title + subtitle (identity)
 * - Right slot: Page-specific controls (status & actions)
 *
 * @example
 * <PageHeader title="Market Pulse" subtitle="Real-time market analytics">
 *   <TimeGranularityToggle />
 *   <FilterButton />
 * </PageHeader>
 */
/**
 * @param {{ title: string, subtitle?: string, children?: React.ReactNode }} props
 */
function PageHeaderBase({ title, subtitle, children }) {
  return (
    <div className="flex flex-row justify-between items-start w-full mb-4 md:mb-6 gap-4">
      {/* SLOT 1: LEFT (Identity) */}
      <div className="flex flex-col gap-1 max-w-3xl min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm font-medium text-gray-500">
            {subtitle}
          </p>
        )}
      </div>

      {/* SLOT 2: RIGHT (Controls) */}
      {children && (
        <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}

export const PageHeader = React.memo(PageHeaderBase);

export default PageHeader;
