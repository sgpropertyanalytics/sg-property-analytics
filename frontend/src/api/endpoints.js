/**
 * API Endpoints - Single Source of Truth
 *
 * All API paths should be imported from here, not hardcoded as strings.
 * This enables:
 * 1. Contract drift detection (scripts/check_route_contract.py)
 * 2. Easy refactoring when endpoints change
 * 3. TypeScript/IDE autocomplete
 *
 * Usage:
 *   import { API } from './endpoints';
 *   apiClient.get(API.metadata);
 */

export const API = {
  // Core data
  ping: '/ping',
  health: '/health',
  metadata: '/metadata',
  filterOptions: '/filter-options',
  // districts: '/districts', // DEPRECATED - use filterOptions.districts instead

  // Analytics
  aggregate: '/aggregate',
  dashboard: '/dashboard',
  kpiSummaryV2: '/kpi-summary-v2',

  // Charts
  newVsResale: '/new-vs-resale',
  newLaunchTimeline: '/new-launch-timeline',
  newLaunchAbsorption: '/new-launch-absorption',
  budgetHeatmap: '/budget-heatmap',
  floorLiquidityHeatmap: '/floor-liquidity-heatmap',

  // Projects
  projectNames: '/projects/names',
  hotProjects: '/projects/hot',
  projectInventory: (name) => `/projects/${encodeURIComponent(name)}/inventory`,
  projectExitQueue: (name) => `/projects/${encodeURIComponent(name)}/exit-queue`,
  projectPriceBands: (name) => `/projects/${encodeURIComponent(name)}/price-bands`,
  projectPriceGrowth: (name) => `/transactions/price-growth?project=${encodeURIComponent(name)}&per_page=500`,

  // Deal Checker
  dealCheckerMultiScope: '/deal-checker/multi-scope',

  // GLS & Supply
  glsAll: '/gls/all',
  upcomingLaunchesAll: '/upcoming-launches/all',
  supplySummary: '/supply/summary',

  // Insights (maps)
  districtPsf: '/insights/district-psf',
  districtLiquidity: '/insights/district-liquidity',

  // Auth
  authRegister: '/auth/register',
  authLogin: '/auth/login',
  authMe: '/auth/me',
  authFirebaseSync: '/auth/firebase-sync',
  authSubscription: '/auth/subscription',
  authDeleteAccount: '/auth/delete-account',

  // Payments
  paymentsPortal: '/payments/portal',
};

export default API;
