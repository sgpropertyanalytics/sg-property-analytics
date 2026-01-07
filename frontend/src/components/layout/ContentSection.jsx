/**
 * ContentSection - L1 White Frame Container
 *
 * Groups related content (KPIs, charts) into visually contained sections.
 * Creates "canvas vs content" separation for better scannability.
 *
 * Layer Model:
 * L0: PageCanvas (#F0EDE8 warm stone)
 * L1: ContentSection (#FAF9F7 warm off-white) ← This component
 * L2: Cards (#FFFCF5 warm cream)
 *
 * @param {ReactNode} children - Content to render inside the section
 * @param {string} title - Optional section header (rendered as terminal-header style)
 * @param {string} className - Additional CSS classes
 */
export function ContentSection({ children, title, className = '' }) {
  return (
    <section
      className={`bg-canvas-paper border border-stone-200 p-4 md:p-6 mb-4 md:mb-6 ${className}`}
    >
      {title && (
        <h2 className="terminal-header pb-3 mb-4 border-b border-stone-200">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export default ContentSection;
