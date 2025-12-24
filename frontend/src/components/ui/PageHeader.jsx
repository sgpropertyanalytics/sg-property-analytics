import { useContext } from 'react';
import SubscriptionContext from '../../context/SubscriptionContext';

/**
 * PageHeader - Universal header component for dashboard pages
 *
 * Layout:
 * - Left slot: Title + subtitle (identity)
 * - Right slot: Preview badge + page-specific controls (status & actions)
 *
 * The preview mode badge automatically appears for free users.
 *
 * @example
 * <PageHeader title="Market Pulse" subtitle="Real-time market analytics">
 *   <TimeGranularityToggle />
 *   <FilterButton />
 * </PageHeader>
 */
export function PageHeader({ title, subtitle, children }) {
  // Use context directly to avoid throwing if context is missing
  const context = useContext(SubscriptionContext);
  const isPremium = context?.isPremium ?? false;
  const isPreviewMode = !isPremium;

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

      {/* SLOT 2: RIGHT (Controls & Status) */}
      <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
        {/* Preview Mode Badge - Always first in the list */}
        {isPreviewMode && (
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Preview Mode
          </div>
        )}

        {/* Page-specific controls injected here */}
        {children}
      </div>
    </div>
  );
}

export default PageHeader;
