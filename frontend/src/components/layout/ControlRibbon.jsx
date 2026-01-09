/**
 * ControlRibbon - Sticky Filter Bar Container
 *
 * Wraps filter controls in a contained, sticky band.
 * Stacks below the console header (h-12 = 48px) using top-12.
 *
 * Features:
 * - Sticky positioning below console header (top-12)
 * - Solid white background with backdrop blur for glassmorphism
 * - Border-bottom separator line when scrolling
 * - Bleeds to page edges with negative margins (full-width containment)
 *
 * @param {ReactNode} children - Filter controls (typically FilterBar)
 */
export function ControlRibbon({ children }) {
  return (
    <div className="sticky top-12 z-30 -mx-4 md:-mx-6 lg:-mx-6 px-4 md:px-6 lg:px-6 bg-white/90 backdrop-blur-md border-b border-gray-200 mb-4">
      {children}
    </div>
  );
}

export default ControlRibbon;
