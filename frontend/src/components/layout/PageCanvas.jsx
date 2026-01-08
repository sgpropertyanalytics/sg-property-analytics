/**
 * PageCanvas - L0 Container (The Warm Stone Wall)
 *
 * Provides consistent padding and acts as the base layer for all dashboard pages.
 * Content sections float as "warm cream paintings" on this warm stone canvas.
 *
 * Layer Model:
 * L0: PageCanvas (#F0EDE8 warm stone) ← This component
 * L1: ContentSection (#FAF9F7 warm off-white)
 * L2: Cards (#FFFCF5 warm cream)
 */
import Container from '../primitives/Container.jsx';

export function PageCanvas({ children, className = '' }) {
  return (
    <div className={`min-h-full py-4 md:py-6 lg:py-8 ${className}`}>
      <Container>
        {children}
      </Container>
    </div>
  );
}

export default PageCanvas;
