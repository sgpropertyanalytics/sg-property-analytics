/**
 * ControlRibbon - Sticky Filter Bar Container
 *
 * Wraps filter controls in a contained, sticky band.
 * Stacks below the console header (h-12 = 48px) using top-12.
 *
 * Features:
 * - Sticky positioning below console header (top-12)
 * - No width manipulation - inherits from parent Container (PageCanvas)
 * - Visual styling (borders, background) handled by filter bar component
 *
 * @param {ReactNode} children - Filter controls (typically FilterBar)
 */
export function ControlRibbon({ children }) {
  return (
    <div className="sticky top-12 z-30 mb-4">
      {children}
    </div>
  );
}

export default ControlRibbon;
