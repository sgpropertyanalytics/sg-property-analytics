/**
 * ContentSection - L1 Data Card Container
 *
 * Groups related content (KPIs, charts) into visually contained sections.
 * White background with thin grey border - "paper on desk" aesthetic.
 *
 * Layer Model:
 * L0: Content Canvas (dot grid background #F9FAFB)
 * L1: ContentSection (white with gray-200 border) ← This component
 * L2: Individual data cards/charts
 *
 * @param {ReactNode} children - Content to render inside the section
 * @param {string} title - Optional section header (rendered as terminal-header style)
 * @param {string} className - Additional CSS classes
 */
export function ContentSection({ children, title, className = '' }) {
  return (
    <section
      className={`bg-white border border-gray-200 p-4 md:p-6 mb-4 md:mb-6 ${className}`}
    >
      {title && (
        <h2 className="terminal-header pb-3 mb-4 border-b border-gray-200">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export default ContentSection;
