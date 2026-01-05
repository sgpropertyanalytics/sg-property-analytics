/**
 * ChartBlueprint - Abstract architectural skeleton for frost overlay
 *
 * A generic "dashboard abstract" SVG that works behind frosted glass.
 * Uses stroke-based patterns (bars + trend line) that blur into
 * a universal "analytics data" impression.
 *
 * Features:
 * - currentColor for Tailwind theme control
 * - preserveAspectRatio="none" for flexible container sizing
 * - Mixed metaphor (bars + curve) works for any chart type
 * - Accessible: aria-hidden + role="presentation" for screen readers
 */
export const ChartBlueprint = ({ className = '' }) => (
  <svg
    viewBox="0 0 400 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="none"
    aria-hidden="true"
    role="presentation"
    className={`w-full h-full select-none pointer-events-none ${className}`}
  >
    {/* Grid structure - the "paper" */}
    <path d="M0 199.5H400" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
    <path d="M0 49.5H400" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="4 4" />
    <path d="M0 99.5H400" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="4 4" />
    <path d="M0 149.5H400" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="4 4" />

    {/* Abstract data - the "ink" */}
    {/* Bars */}
    <rect x="40" y="120" width="30" height="80" rx="2" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4" />
    <rect x="90" y="80" width="30" height="120" rx="2" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4" />
    <rect x="140" y="140" width="30" height="60" rx="2" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4" />

    {/* Trend line */}
    <path
      d="M200 130 C 230 130, 240 90, 280 90 S 330 50, 360 40"
      stroke="currentColor"
      strokeWidth="2"
      strokeOpacity="0.4"
      strokeLinecap="round"
    />
  </svg>
);

export default ChartBlueprint;
