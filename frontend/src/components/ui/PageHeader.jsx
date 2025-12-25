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
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-row justify-between items-start w-full mb-4 md:mb-6 gap-4">
      {/* SLOT 1: LEFT (Identity) */}
      <div className="flex flex-col gap-1 max-w-3xl min-w-0">
        <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448] leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[#547792] text-sm italic truncate">
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

export default PageHeader;
