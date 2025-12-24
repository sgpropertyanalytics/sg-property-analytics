/**
 * UI Component Library
 *
 * Standardized responsive components for the Singapore Property Analytics Dashboard.
 *
 * Currently active components:
 * - KPICard: Responsive stat/metric cards
 * - KeyInsightBox: Plain English insight summaries for charts
 * - PageSummaryBox: "What This Page Shows" page-level explanations
 * - SectionHeader: Visual section dividers with accent bars
 * - SampleSizeWarning: Low data warnings
 *
 * For responsive layout patterns, use Tailwind CSS classes directly.
 * See .claude/skills/ for design system documentation.
 */

// KPI components (actively used)
export { KPICard, KPICardSkeleton, KPICardGroup } from './KPICard';

// Insight & Summary components
export { KeyInsightBox } from './KeyInsightBox';
export { PageSummaryBox, SectionHeader } from './PageSummaryBox';
export { SampleSizeWarning } from './SampleSizeWarning';

// Error handling
export { ErrorBoundary, withErrorBoundary } from './ErrorBoundary';

// Premium gating
export { ChartGate } from './ChartGate';
