/**
 * UI Component Library
 *
 * Standardized responsive components for the Singapore Property Analytics Dashboard.
 *
 * Active components:
 * - KPICardV2: Responsive stat/metric cards with tooltips
 * - KeyInsightBox: Plain English insight summaries for charts
 * - ErrorBoundary: Error handling wrapper
 * - ChartWatermark: Visual safeguard for preview mode
 *
 * For responsive layout patterns, use Tailwind CSS classes directly.
 * See .claude/skills/ for design system documentation.
 */

// KPI components (standalone cards for pages)
export { KPICardV2, KPICardV2Group, KPIHeroContent, KPIHudStrip } from './KPICardV2';
export { HelpTooltip } from './HelpTooltip';

// Inline cards (compact cards inside chart headers)
export { InlineCard, InlineCardRow } from './InlineCard';

// Insight components
export { KeyInsightBox } from './KeyInsightBox';

// Error handling
export { ErrorBoundary, withErrorBoundary } from './ErrorBoundary';

// Premium gating
export { ChartWatermark } from './ChartWatermark';
export { PreviewChartOverlay } from './PreviewChartOverlay';

// Layout components
export { PageHeader } from './PageHeader';
export { ChartPanel } from './ChartPanel';
export { DataSection } from './DataSection';
export { ChartSlot } from './ChartSlot';

// Universal Template with Status Deck (Production-grade dashboard template)
export {
  DataCard,
  DataCardHeader,
  DataCardToolbar,
  DataCardCanvas,
  // Layer 4: Status Deck (IDE-style status bar)
  StatusDeck,          // 3-zone layout: left | center legend | right
  StatusPeriod,        // Left zone: period/view indicator
  StatusCount,         // Right zone: transaction count
  StatusBadge,         // Right zone: warning/info badge
  LegendLine,          // Center zone: legend item with line swatch
  // Other components
  DataCardFooter,
  ToolbarStat,
  AgentButton,
  AgentFooter,
  // Legacy (backward compatibility)
  DataCardLegendDock,  // @deprecated - use StatusDeck
  ToolbarLegend,       // @deprecated - use StatusDeck
  LegendDot,           // @deprecated - use LegendLine
  DataRailItem,
  FloatingLegendItem,
  DataCardInsightStrip,
  ChartLegendOverlay,
  LegendItem,
} from './DataCard';

// Delta indicators (Luxury design system)
export { DeltaPill, DeltaText } from './DeltaPill';
