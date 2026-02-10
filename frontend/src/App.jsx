import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

// DEV-ONLY: Lazy load React Query DevTools to avoid bundling in production
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({
        default: m.ReactQueryDevtools,
      }))
    )
  : () => null;

// Register Chart.js components globally (MUST be before any chart imports)
import './chartSetup';

import { queryClient } from './lib/queryClient';
import { DataProvider } from './context/DataContext';
import { AuthProvider } from './context/AuthContext';
import { AccessProvider } from './context/AccessContext';
// Phase 3.4: PowerBIFilterProvider removed - useZustandFilters is now self-contained
import { AppReadyProvider } from './context/AppReadyContext';
import { DebugProvider } from './context/DebugContext';
import { ChartTimingProvider } from './context/ChartTimingContext';
import LandingPage from './pages/LandingV3';
import Login from './pages/Login';
import { DashboardLayout } from './components/layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PageHeader } from './components/ui';
import { BootStuckBanner } from './components/common/BootStuckBanner';
import { Toaster } from 'sonner';

// ===== Lazy Loading with Chunk Error Recovery =====
// Auto-reloads once on chunk-load failure (common after deployments).
// sessionStorage guard prevents infinite reload loop.
const CHUNK_RETRY_KEY = 'chunk_reload_attempted';

function isChunkLoadError(error) {
  return (
    error?.name === 'ChunkLoadError' ||
    error?.message?.includes('Loading chunk') ||
    error?.message?.includes('Failed to fetch dynamically imported module')
  );
}

function ChunkLoadErrorFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] p-6 text-center">
      <p className="text-sm text-gray-600 mb-4">Page failed to load after update.</p>
      <button
        onClick={() => { sessionStorage.removeItem(CHUNK_RETRY_KEY); window.location.reload(); }}
        className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
      >
        Refresh
      </button>
    </div>
  );
}

function lazyWithRetry(componentImport) {
  return lazy(() =>
    componentImport().catch((error) => {
      if (!isChunkLoadError(error)) throw error;

      const alreadyRetried = sessionStorage.getItem(CHUNK_RETRY_KEY);
      if (!alreadyRetried) {
        sessionStorage.setItem(CHUNK_RETRY_KEY, '1');
        window.location.reload();
        return { default: () => null };
      }

      sessionStorage.removeItem(CHUNK_RETRY_KEY);
      return { default: ChunkLoadErrorFallback };
    })
  );
}

// ===== Lazy-loaded Dashboard Pages =====
// These are code-split to reduce initial bundle size.
// Chart-heavy pages load on demand when user navigates.
const MacroOverviewContent = lazyWithRetry(() =>
  import('./pages/MacroOverview').then(m => ({ default: m.MacroOverviewContent }))
);
const ProjectDeepDiveContent = lazyWithRetry(() =>
  import('./pages/ProjectDeepDive').then(m => ({ default: m.ProjectDeepDiveContent }))
);
const DistrictDeepDiveContent = lazyWithRetry(() =>
  import('./pages/DistrictDeepDive').then(m => ({ default: m.DistrictDeepDiveContent }))
);
const ValueParityPanel = lazyWithRetry(() =>
  import('./components/ValueParityPanel').then(m => ({ default: m.ValueParityPanel }))
);
const SupplyInsightsContent = lazyWithRetry(() =>
  import('./pages/SupplyInsights').then(m => ({ default: m.SupplyInsightsContent }))
);
const PrimaryMarketContent = lazyWithRetry(() =>
  import('./pages/PrimaryMarket').then(m => ({ default: m.PrimaryMarketContent }))
);
const MethodologyContent = lazyWithRetry(() =>
  import('./pages/Methodology').then(m => ({ default: m.MethodologyContent }))
);
const ExitRiskContent = lazyWithRetry(() =>
  import('./pages/ExitRisk').then(m => ({ default: m.ExitRiskContent }))
);

// DEV-ONLY: Performance Dashboard for chart timing instrumentation
const PerformanceDashboard = lazyWithRetry(() =>
  import('./pages/PerformanceDashboard').then(m => ({ default: m.PerformanceDashboard }))
);

// Note: Loading fallback moved to DashboardLayout to keep nav rail persistent

/**
 * App Component with Landing Page and Dashboard Navigation
 *
 * Layout Structure:
 * - Landing page at / and /landing (public)
 * - DashboardLayout wraps all dashboard pages (authenticated features)
 * - GlobalNavRail (64px) provides primary navigation
 * - PowerBIFilterSidebar (280px) provides contextual filtering
 *
 * Routes:
 * - /: Landing page (public)
 * - /landing: Landing page (public)
 * - /login: User authentication
 * - /market-overview: Resale market analytics dashboard (authenticated)
 * - /new-launch-market: New Sale vs Resale comparison (authenticated)
 * - /district-overview: District overview analysis (authenticated)
 * - /explore: Budget-based property search (authenticated)
 * - /value-check: Compare purchase to nearby transactions (authenticated)
 * - /exit-risk: Exit risk analysis (authenticated)
 * - /supply-inventory: Supply & inventory insights (authenticated)
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <AccessProvider>
      <AuthProvider>
        <DataProvider>
          <DebugProvider>
          <ChartTimingProvider>
          <BrowserRouter>
            {/* AppReadyProvider gates data fetching until boot is complete (auth + subscription + filters) */}
            <AppReadyProvider>
            {/* BootStuckBanner - Recovery UI when boot is stuck >10s */}
            <BootStuckBanner />
            <Routes>
              {/* ===== Public Routes (No Dashboard Layout) ===== */}

              {/* Landing Page - Public home page */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/landing" element={<LandingPage />} />

              {/* Login - Authentication */}
              <Route path="/login" element={<Login />} />

          {/* ===== Dashboard Routes with Double-Sidebar Layout ===== */}
          {/* All dashboard routes share a single DashboardLayout to prevent nav rail flickering */}
          {/* The layout stays mounted while only the Outlet content changes during navigation */}
          <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            {/* Market Overview - Resale analytics dashboard (Lazy-loaded) */}
            <Route path="/market-overview" element={<MacroOverviewContent />} />

            {/* New Launch Market - New Sale vs Resale comparison (Lazy-loaded) */}
            <Route path="/new-launch-market" element={<PrimaryMarketContent />} />

            {/* Value Check - Compare your purchase to nearby transactions (Lazy-loaded) */}
            <Route
              path="/value-check"
              element={
                 <div className="min-h-full">
                  <div className="p-3 md:p-4 lg:p-6">
                    <PageHeader
                      title="Value Check"
                      subtitle="Compare your purchase to nearby transactions and evaluate if it's a good deal"
                    />
                    <div className="animate-view-enter">
                      <ValueParityPanel />
                    </div>
                  </div>
                </div>
              }
            />

            {/* District Overview (Lazy-loaded) */}
            <Route path="/district-overview" element={<DistrictDeepDiveContent />} />

            {/* Explore - Budget-based property search (Lazy-loaded) */}
            <Route path="/explore" element={<ProjectDeepDiveContent />} />

            {/* Exit Risk - Comprehensive project exit analysis (Lazy-loaded) */}
            <Route path="/exit-risk" element={<ExitRiskContent />} />

            {/* Supply & Inventory Insights (Lazy-loaded) */}
            <Route path="/supply-inventory" element={<SupplyInsightsContent />} />

            {/* Methodology - Assumptions, classifications, data sources */}
            <Route path="/methodology" element={<MethodologyContent />} />
          </Route>

          {/* ===== Legacy Route Redirects ===== */}
          {/* Old routes redirect to new routes for backwards compatibility */}
          <Route path="/market-core" element={<Navigate to="/market-overview" replace />} />
          <Route path="/primary-market" element={<Navigate to="/new-launch-market" replace />} />
          <Route path="/value-parity" element={<Navigate to="/value-check" replace />} />
          <Route path="/district-deep-dive" element={<Navigate to="/district-overview" replace />} />
          <Route path="/project-deep-dive" element={<Navigate to="/explore" replace />} />
          <Route path="/project-analysis" element={<Navigate to="/value-check" replace />} />
          <Route path="/floor-dispersion" element={<Navigate to="/explore" replace />} />
          <Route path="/analytics-view" element={<Navigate to="/explore" replace />} />
          <Route path="/analytics" element={<Navigate to="/market-overview" replace />} />
          <Route path="/dashboard" element={<Navigate to="/market-overview" replace />} />
          <Route path="/macro-overview" element={<Navigate to="/market-overview" replace />} />
          <Route path="/market-pulse" element={<Navigate to="/market-overview" replace />} />
          <Route path="/supply-insights" element={<Navigate to="/supply-inventory" replace />} />

              {/* DEV-ONLY: Performance Dashboard for chart timing instrumentation */}
              {import.meta.env.DEV && (
                <Route path="/perf" element={<PerformanceDashboard />} />
              )}

              {/* Catch-all -> Landing Page */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </AppReadyProvider>
          </BrowserRouter>
          </ChartTimingProvider>
          </DebugProvider>
        </DataProvider>
      </AuthProvider>
    </AccessProvider>
    {/* TanStack Query DevTools - lazy loaded, only in development */}
    {import.meta.env.DEV && (
      <Suspense fallback={null}>
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      </Suspense>
    )}
    {/* Global toast notifications */}
    <Toaster richColors closeButton position="top-center" />
    </QueryClientProvider>
  );
}

export default App;
