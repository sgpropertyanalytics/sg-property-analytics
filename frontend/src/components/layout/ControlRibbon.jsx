import Container from '../primitives/Container.jsx';

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
 * - Outer wrapper bleeds to page edges (full-width background)
 * - Inner Container ensures alignment with PageCanvas content
 *
 * @param {ReactNode} children - Filter controls (typically FilterBar)
 */
export function ControlRibbon({ children }) {
  return (
    <div className="sticky top-12 z-30 -mx-4 md:-mx-6 lg:-mx-8 bg-white/90 backdrop-blur-md border-b border-slate-200 mb-4">
      {/* Container ensures filter content aligns with PageCanvas content */}
      <Container className="py-0">
        {children}
      </Container>
    </div>
  );
}

export default ControlRibbon;
