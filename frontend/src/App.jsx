import { lazy } from 'react';
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
const PrimaryMarketContent = lazyWithRetry(() =>
  import('./pages/PrimaryMarket').then(m => ({ default: m.PrimaryMarketContent }))
);
const MethodologyContent = lazyWithRetry(() =>
  import('./pages/Methodology').then(m => ({ default: m.MethodologyContent }))
);
const ExitRiskContent = lazyWithRetry(() =>
  import('./pages/ExitRisk').then(m => ({ default: m.ExitRiskContent }))
);

// Note: Loading fallback moved to DashboardLayout to keep nav rail persistent

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
 * - /market-overview: Resale market analytics dashboard (premium)
 * - /new-launch-market: New Sale vs Resale comparison (premium)
 * - /district-overview: District overview analysis (premium)
 * - /explore: Budget-based property search (premium)
 * - /value-check: Compare purchase to nearby transactions (premium)
 * - /exit-risk: Exit risk analysis (premium)
 * - /supply-inventory: Supply & inventory insights (premium)
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
                <div className="min-h-full bg-[#EAE0CF]/40">
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
