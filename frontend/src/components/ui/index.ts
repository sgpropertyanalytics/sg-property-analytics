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
export { KPICardV2, KPICardV2Skeleton, KPICardV2Group, mapKpiV2ToCardProps } from './KPICardV2';
export { HelpTooltip } from './HelpTooltip';

// Inline cards (compact cards inside chart headers)
export { InlineCard, InlineCardGroup, InlineCardRow } from './InlineCard';

// Insight components
export { KeyInsightBox } from './KeyInsightBox';

// Error handling
export { ErrorBoundary, withErrorBoundary } from './ErrorBoundary';

// Premium gating
export { ChartWatermark } from './ChartWatermark';
export { PreviewChartOverlay } from './PreviewChartOverlay';

// Layout components
export { PageHeader } from './PageHeader';
export { ChartSlot } from './ChartSlot';
