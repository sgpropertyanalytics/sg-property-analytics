/**
 * UI Component Library
 *
 * Standardized responsive components for the Singapore Property Analytics Dashboard.
 *
 * Active components:
 * - KPICard: Responsive stat/metric cards
 * - KeyInsightBox: Plain English insight summaries for charts
 * - ErrorBoundary: Error handling wrapper
 * - ChartWatermark: Visual safeguard for preview mode
 *
 * For responsive layout patterns, use Tailwind CSS classes directly.
 * See .claude/skills/ for design system documentation.
 */

// KPI components
export { KPICard, KPICardSkeleton, KPICardGroup } from './KPICard';

// Insight components
export { KeyInsightBox } from './KeyInsightBox';

// Error handling
export { ErrorBoundary, withErrorBoundary } from './ErrorBoundary';

// Premium gating
export { ChartWatermark } from './ChartWatermark';
export { BlurredDashboard } from './BlurredDashboard';
export { PreviewModeBar } from './PreviewModeBar';
export { PreviewChartOverlay } from './PreviewChartOverlay';

// Layout components
export { PageHeader } from './PageHeader';
export { ChartFrame } from './ChartFrame';
