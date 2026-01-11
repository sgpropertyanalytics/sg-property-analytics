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

// Universal Template with Two Layout Modes (Production-grade dashboard template)
// See DataCard.tsx header for full documentation of Footerless Standard vs StatusDeck modes
export {
  DataCard,
  DataCardHeader,
  DataCardDescription, // Optional fixed-height description slot (h-8, 2 lines max)
  DataCardToolbar,
  DataCardCanvas,
  // Footerless Standard (Recommended - maximizes chart area)
  FloatingLegend,      // Legend in chart's Y-axis safe zone (use with 1.2x Y-axis buffer)
  HeaderMetaBadge,     // High-density header metadata badge (N = X, transaction counts)
  LegendDot,           // Legend item with dot swatch (for FloatingLegend or StatusDeck)
  LegendLine,          // Legend item with line swatch
  // StatusDeck (Legacy - IDE-style status bar)
  StatusDeck,          // 3-zone layout: left | center legend | right
  StatusPeriod,        // Left zone: period/view indicator
  StatusCount,         // Right zone: transaction count
  StatusBadge,         // Right zone: warning/info badge
  // Other components
  DataCardFooter,
  ToolbarStat,
  AgentButton,
  AgentFooter,
  // Legacy (backward compatibility)
  DataCardLegendDock,  // @deprecated - use StatusDeck
  ToolbarLegend,       // @deprecated - use StatusDeck
  DataRailItem,
  FloatingLegendItem,
  DataCardInsightStrip,
  ChartLegendOverlay,
  LegendItem,
} from './DataCard';

// Delta indicators (Luxury design system)
export { DeltaPill, DeltaText } from './DeltaPill';
