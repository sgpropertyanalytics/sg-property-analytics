/**
 * ControlRibbon - Sticky Filter Bar Container
 *
 * Wraps filter controls in a contained, sticky band.
 * Uses transparent background with structural bottom border (Industrial Wireframe aesthetic).
 *
 * Features:
 * - Sticky positioning (stays at top during scroll)
 * - Transparent with subtle backdrop blur
 * - Bleeds to page edges with negative margins (full-width containment)
 * - Stone-400 bottom border for separation
 *
 * @param {ReactNode} children - Filter controls (typically FilterBar)
 */
export function ControlRibbon({ children }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-3 bg-transparent backdrop-blur-sm border-b border-stone-400 mb-6">
      {children}
    </div>
  );
}

export default ControlRibbon;
