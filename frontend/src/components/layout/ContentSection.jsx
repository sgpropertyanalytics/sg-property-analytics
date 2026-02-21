/**
 * ContentSection - L1 Intelligence Panel
 *
 * Groups related content (KPIs, charts) into visually contained sections.
 * Uses the .intel-panel HUD treatment for Palantir-style intelligence aesthetic:
 * - HUD corner brackets (top-left, bottom-right)
 * - Ruler tick marks along top edge
 * - Inset shadow for depth
 * - Subtle hover state
 *
 * Layer Model:
 * L0: Content Canvas (dot grid background #F9FAFB)
 * L1: ContentSection (intel-panel with HUD frame) ← This component
 * L2: Individual data cards/charts
 *
 * @param {ReactNode} children - Content to render inside the section
 * @param {string} title - Optional section header (rendered as terminal-header style)
 * @param {string} className - Additional CSS classes
 */
export function ContentSection({ children, title, className = '' }) {
  return (
    <section
      className={`intel-panel p-4 md:p-6 mb-4 md:mb-6 ${className}`}
    >
      {/* Ruler tick marks - top edge precision indicators */}
      <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
      <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
      <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
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
