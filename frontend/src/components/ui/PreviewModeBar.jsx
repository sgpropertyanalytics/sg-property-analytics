/**
 * PreviewModeBar - Floating Status Capsule for free users
 *
 * A compact, modern floating capsule that indicates preview mode.
 * Looks like a "Dynamic System Status" rather than a rigid banner.
 *
 * Design:
 * - Rounded-full capsule shape
 * - Centered horizontally, floats with content
 * - Subtle amber/warm tint
 * - Pulsing status dot
 */
export function PreviewModeBar({ resultCount, loading, onUnlock }) {
  return (
    <div className="flex justify-center mt-4 mb-2">
      <div className="inline-flex items-center gap-2 h-8 px-4 rounded-full bg-amber-50 border border-amber-200/50">
        {/* Pulsing status dot */}
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />

        {/* Status text */}
        <span className="text-amber-700 font-mono text-xs font-bold uppercase tracking-wider">
          Preview Mode
        </span>

        {/* Separator */}
        <span className="text-amber-300">•</span>

        {/* Data range info */}
        <span className="text-amber-600 font-mono text-xs">
          {loading ? (
            <span className="animate-pulse">Loading...</span>
          ) : resultCount !== null && resultCount !== undefined ? (
            <>{resultCount.toLocaleString()} transactions</>
          ) : (
            <>Historical Data: Dec 2020 - Present</>
          )}
        </span>
      </div>
    </div>
  );
}

export default PreviewModeBar;
