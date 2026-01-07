/**
 * ControlRibbon - Sticky Filter Bar Container
 *
 * Wraps filter controls in a contained, sticky band that floats above content.
 * Uses frosted glass effect to indicate it sits above the page content.
 *
 * Features:
 * - Sticky positioning (stays at top during scroll)
 * - Frosted glass backdrop blur
 * - Bleeds to page edges with negative margins (full-width containment)
 * - Subtle bottom border for separation
 *
 * @param {ReactNode} children - Filter controls (typically FilterBar)
 */
export function ControlRibbon({ children }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-3 bg-card/90 backdrop-blur-sm border-b border-stone-200 mb-6">
      {children}
    </div>
  );
}

export default ControlRibbon;
