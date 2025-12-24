/**
 * PreviewModeBar - Fixed Overlay Status Bar for free users
 *
 * A subtle overlay bar at the top of the viewport.
 * Does NOT affect layout - uses fixed positioning.
 * Semi-transparent with blur backdrop.
 *
 * Design:
 * - Fixed position at top (overlays content)
 * - Uses project color theme (deep navy)
 * - Semi-transparent with backdrop blur
 * - Doesn't push down or affect chart layouts
 */
export function PreviewModeBar({ resultCount, loading }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="flex justify-center pt-2">
        <div className="inline-flex items-center gap-2 h-7 px-4 rounded-full bg-[#213448]/80 backdrop-blur-sm border border-[#547792]/30 pointer-events-auto">
          {/* Pulsing status dot */}
          <span className="w-1.5 h-1.5 rounded-full bg-[#94B4C1] animate-pulse" />

          {/* Status text */}
          <span className="text-[#EAE0CF] text-[10px] font-medium uppercase tracking-wider">
            Preview Mode
          </span>

          {/* Separator */}
          <span className="text-[#547792]">•</span>

          {/* Data info */}
          <span className="text-[#94B4C1] text-[10px]">
            {loading ? (
              <span className="animate-pulse">Loading...</span>
            ) : resultCount !== null && resultCount !== undefined ? (
              <>{resultCount.toLocaleString()} transactions</>
            ) : (
              <>Dec 2020 - Present</>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export default PreviewModeBar;
