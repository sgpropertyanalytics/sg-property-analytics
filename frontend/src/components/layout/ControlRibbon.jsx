import Container from '../primitives/Container.jsx';

/**
 * ControlRibbon - Sticky Filter Bar Container
 *
 * Wraps filter controls in a contained, sticky band.
 * Stacks below the console header (h-12 = 48px) using top-12.
 *
 * Features:
 * - Sticky positioning below console header (top-12)
 * - Outer wrapper bleeds to page edges (full-width band)
 * - Inner Container ensures alignment with PageCanvas content
 * - Visual styling (borders, background) handled by filter bar component
 *
 * @param {ReactNode} children - Filter controls (typically FilterBar)
 */
export function ControlRibbon({ children }) {
  return (
    <div className="sticky top-12 z-30 -mx-4 md:-mx-6 lg:-mx-8 mb-4">
      {/* Container ensures filter content aligns with PageCanvas content */}
      <Container className="py-0">
        {children}
      </Container>
    </div>
  );
}

export default ControlRibbon;
