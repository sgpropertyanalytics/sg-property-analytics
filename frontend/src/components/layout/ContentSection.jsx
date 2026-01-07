/**
 * ContentSection - L1 Wireframe Container
 *
 * Groups related content (KPIs, charts) into visually contained sections.
 * Uses transparent background with structural borders (Industrial Wireframe aesthetic).
 *
 * Layer Model:
 * L0: PageCanvas (#F2EFE9 engineering paper with grid)
 * L1: ContentSection (transparent with stone-400 border) ← This component
 * L2: Cards (transparent with stone-400 border)
 *
 * @param {ReactNode} children - Content to render inside the section
 * @param {string} title - Optional section header (rendered as terminal-header style)
 * @param {string} className - Additional CSS classes
 */
export function ContentSection({ children, title, className = '' }) {
  return (
    <section
      className={`bg-transparent border border-stone-400 p-4 md:p-6 mb-4 md:mb-6 ${className}`}
    >
      {title && (
        <h2 className="terminal-header pb-3 mb-4 border-b border-stone-400">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export default ContentSection;
