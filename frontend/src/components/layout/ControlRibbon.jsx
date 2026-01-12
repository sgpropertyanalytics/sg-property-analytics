/**
 * ControlRibbon - Sticky Filter Bar Container with Frosted Glass Effect
 *
 * Wraps filter controls in a contained, sticky band with backdrop blur.
 * Stacks below the Frosted Bezel header (pt-6 + h-12 + pb-2 = 80px).
 *
 * Features:
 * - Sticky positioning below frosted bezel (top-[80px])
 * - Frosted glass effect (backdrop-blur + semi-transparent bg)
 * - Charts scroll underneath and blur for premium feel
 * - No width manipulation - inherits from parent Container (PageCanvas)
 *
 * @param {ReactNode} children - Filter controls (typically FilterBar)
 */
export function ControlRibbon({ children }) {
  return (
    <div className="sticky top-[80px] z-30 mb-4 bg-[#F5F3EE]/90 backdrop-blur-xl overflow-visible">
      {children}
    </div>
  );
}

export default ControlRibbon;
