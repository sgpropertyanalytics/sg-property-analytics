import { Lock } from 'lucide-react';

/**
 * PreviewModeBar - Thin sticky bar for free users
 *
 * Displays at top of content area:
 * - "PREVIEW MODE" badge
 * - Result count (e.g., "1,284 transactions match your filters")
 * - "Unlock Full Access" button
 *
 * Color palette:
 * - Background: Deep Navy (#213448)
 * - Text: Sand/Cream (#EAE0CF)
 * - Badge: Ocean Blue (#547792)
 * - Count: Sky Blue (#94B4C1)
 */
export function PreviewModeBar({ resultCount, loading, onUnlock }) {
  return (
    <div className="sticky top-0 z-20 bg-[#213448] border-b border-[#547792]/30 px-4 py-2">
      <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
        {/* Left side: Badge + Result count */}
        <div className="flex items-center gap-4">
          {/* Preview Mode Badge */}
          <span className="inline-flex items-center gap-1.5 bg-[#547792] text-[#EAE0CF] text-xs font-medium px-2.5 py-1 rounded">
            <Lock className="w-3 h-3" />
            PREVIEW MODE
          </span>

          {/* Result Count */}
          <span className="text-sm text-[#94B4C1]">
            {loading ? (
              <span className="animate-pulse">Counting...</span>
            ) : resultCount !== null && resultCount !== undefined ? (
              <>
                <span className="font-medium text-[#EAE0CF]">{resultCount.toLocaleString()}</span>
                {' '}transactions match your filters
              </>
            ) : null}
          </span>
        </div>

        {/* Right side: Unlock button */}
        <button
          onClick={onUnlock}
          className="bg-[#EAE0CF] text-[#213448] text-sm font-medium px-4 py-1.5 rounded hover:bg-white transition-colors"
        >
          Unlock Full Access
        </button>
      </div>
    </div>
  );
}

export default PreviewModeBar;
