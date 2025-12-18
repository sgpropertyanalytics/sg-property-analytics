/**
 * UI Component Library
 *
 * Standardized responsive components for the Singapore Property Analytics Dashboard.
 * All components follow the skills defined in .claude/skills/:
 * - responsive-layout-system: Desktop-first breakpoint strategy
 * - chart-container-contract: Chart wrapper patterns
 * - filter-ux-pattern: Filter bar and drawer patterns
 * - ui-freeze: Protected chart internals
 * - responsive-dod: Verification checklist
 *
 * Target breakpoints:
 * - Mobile: 375px
 * - Tablet: 768px
 * - Desktop: 1024px
 * - Primary: 1440px
 */

// Responsive hooks and utilities
export {
  BREAKPOINTS,
  TEST_WIDTHS,
  useMediaQuery,
  useBreakpointUp,
  useBreakpointDown,
  useCurrentBreakpoint,
  useDeviceType,
  useWindowSize,
  useIsTouchDevice,
  responsiveClasses,
} from './useMediaQuery';

// Chart components
export { ChartCard, ChartCardSkeleton } from './ChartCard';

// Layout components
export {
  DashboardContainer,
  DashboardMain,
  DashboardSection,
  KPIGrid,
  ChartGrid,
  MixedGrid,
  FullWidthRow,
  TwoColumnRow,
  SidebarLayout,
  ResponsiveLayout,
} from './DashboardGrid';

// KPI components
export { KPICard, KPICardSkeleton, KPICardGroup } from './KPICard';

// Filter components
export {
  FilterBar,
  FilterDrawer,
  FilterChip,
  FilterSection,
  FilterControl,
} from './FilterBar';

// Data table components
export {
  DataTable,
  DataTablePagination,
  DataTableHeader,
} from './DataTable';
export type { Column } from './DataTable';
