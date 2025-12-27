import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { PowerBIFilterProvider } from './context/PowerBIFilterContext';
import LandingPage from './pages/Landing';
import Login from './pages/Login';
import Pricing from './pages/Pricing';
import { DashboardLayout } from './components/layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PageHeader } from './components/ui';

// ===== Lazy Loading with Retry =====
// Wraps lazy imports to handle chunk loading failures gracefully.
// If a chunk fails to load (network error, cache miss, 404), reloads the page.
function lazyWithRetry(componentImport) {
  return lazy(() =>
    componentImport().catch((error) => {
      console.error('Chunk load failed, reloading page...', error);
      // Force full page reload on chunk failure
      // This ensures fresh chunks are fetched from server
      window.location.reload();
      // Return empty component to prevent further errors while reloading
      return { default: () => null };
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

// Loading fallback for lazy-loaded pages
function DashboardLoadingFallback() {
  return (
    <div className="h-full flex items-center justify-center bg-[#EAE0CF]/30">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[#547792]">Loading dashboard...</span>
      </div>
    </div>
  );
}

/**
 * App Component with Landing Page and Dashboard Navigation
 *
 * Layout Structure:
 * - Landing page at / and /landing (public)
 * - DashboardLayout wraps all dashboard pages (premium features)
 * - GlobalNavRail (64px) provides primary navigation
 * - PowerBIFilterSidebar (280px) provides contextual filtering
 *
 * Routes:
 * - /: Landing page (public)
 * - /landing: Landing page (public)
 * - /login: User authentication
 * - /market-pulse: Market analytics dashboard (premium)
 * - /district-deep-dive: District deep dive analysis (premium)
 * - /project-deep-dive: Project analysis with exit queue risk & floor liquidity (premium)
 * - /value-parity: Budget search tool (premium) - includes New Launches + Resale
 */
function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <DataProvider>
          <BrowserRouter>
            {/* PowerBIFilterProvider wraps all routes to prevent context recreation on navigation */}
            <PowerBIFilterProvider>
            <Routes>
              {/* ===== Public Routes (No Dashboard Layout) ===== */}

              {/* Landing Page - Public home page */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/landing" element={<LandingPage />} />

              {/* Login - Authentication */}
              <Route path="/login" element={<Login />} />

              {/* Pricing - Subscription plans */}
              <Route path="/pricing" element={<Pricing />} />

          {/* ===== Dashboard Routes with Double-Sidebar Layout ===== */}

          {/* Market Pulse - Main analytics dashboard (Protected, Lazy-loaded) */}
          <Route
            path="/market-pulse"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="market-pulse">
                  <Suspense fallback={<DashboardLoadingFallback />}>
                    <MacroOverviewContent />
                  </Suspense>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Project Analysis - Redirects to Value Parity (content merged) */}
          <Route path="/project-analysis" element={<Navigate to="/value-parity" replace />} />

          {/* Value Parity Tool - No filter sidebar (Protected, Lazy-loaded) */}
          <Route
            path="/value-parity"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="value-parity">
                  <Suspense fallback={<DashboardLoadingFallback />}>
                    <div className="h-full overflow-auto">
                      <div className="p-3 md:p-4 lg:p-6">
                        {/* Header with Preview Mode badge */}
                        <PageHeader
                          title="Value Parity Tool"
                          subtitle="Find properties within your budget and compare value across districts"
                        />
                        {/* Value Parity Panel - existing component */}
                        <div className="animate-view-enter">
                          <ValueParityPanel />
                        </div>
                      </div>
                    </div>
                  </Suspense>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Legacy route redirects */}
          <Route path="/floor-dispersion" element={<Navigate to="/project-deep-dive" replace />} />
          <Route path="/analytics-view" element={<Navigate to="/project-deep-dive" replace />} />

          {/* District & Project Deep Dive (Protected, Lazy-loaded) */}
          <Route
            path="/district-deep-dive"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="district-deep-dive">
                  <Suspense fallback={<DashboardLoadingFallback />}>
                    <DistrictDeepDiveContent />
                  </Suspense>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Project Deep Dive (Protected, Lazy-loaded) */}
          <Route
            path="/project-deep-dive"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="project-deep-dive">
                  <Suspense fallback={<DashboardLoadingFallback />}>
                    <ProjectDeepDiveContent />
                  </Suspense>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Supply & Inventory Insights (Protected, Lazy-loaded) */}
          <Route
            path="/supply-insights"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="supply-insights">
                  <Suspense fallback={<DashboardLoadingFallback />}>
                    <SupplyInsightsContent />
                  </Suspense>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* ===== Redirects ===== */}

          {/* Legacy route redirects */}
          <Route path="/analytics" element={<Navigate to="/market-pulse" replace />} />
          <Route path="/dashboard" element={<Navigate to="/market-pulse" replace />} />
          <Route path="/macro-overview" element={<Navigate to="/market-pulse" replace />} />

              {/* Catch-all -> Landing Page */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </PowerBIFilterProvider>
          </BrowserRouter>
        </DataProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
