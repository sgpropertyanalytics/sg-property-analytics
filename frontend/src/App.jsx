import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import LandingPage from './pages/Landing';
import Login from './pages/Login';
import Pricing from './pages/Pricing';
import { DashboardLayout } from './components/layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MacroOverviewContent } from './pages/MacroOverview';
import { FloorDispersionContent } from './pages/FloorDispersion';
import { InsightsContent } from './pages/Insights';
import { DistrictDeepDiveContent } from './pages/DistrictDeepDive';
import { ValueParityPanel } from './components/ValueParityPanel';

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
 * - /value-parity: Budget search tool (premium) - includes New Launches + Resale
 * - /floor-dispersion: Floor level analysis (premium)
 * - /district-deep-dive: District and project deep dive analysis (premium)
 * - /insights: AI-powered market insights (premium)
 */
function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <DataProvider>
          <BrowserRouter>
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

          {/* Market Pulse - Main analytics dashboard (Protected) */}
          <Route
            path="/market-pulse"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="market-pulse">
                  <MacroOverviewContent />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Project Analysis - Redirects to Value Parity (content merged) */}
          <Route path="/project-analysis" element={<Navigate to="/value-parity" replace />} />

          {/* Value Parity Tool - No filter sidebar (Protected) */}
          <Route
            path="/value-parity"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="value-parity">
                  <div className="h-full overflow-auto">
                    <div className="p-3 md:p-4 lg:p-6">
                      {/* Header */}
                      <div className="mb-4 md:mb-6">
                        <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
                          Value Parity Tool
                        </h1>
                        <p className="text-[#547792] text-sm mt-1">
                          Find properties within your budget and compare value across districts
                        </p>
                      </div>
                      {/* Value Parity Panel - existing component */}
                      <div className="animate-view-enter">
                        <ValueParityPanel />
                      </div>
                    </div>
                  </div>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Floor Dispersion - Floor level analysis (Protected) */}
          <Route
            path="/floor-dispersion"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="floor-dispersion">
                  <FloorDispersionContent />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Legacy route redirect */}
          <Route path="/analytics-view" element={<Navigate to="/floor-dispersion" replace />} />

          {/* District & Project Deep Dive (Protected) */}
          <Route
            path="/district-deep-dive"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="district-deep-dive">
                  <DistrictDeepDiveContent />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Insights - Placeholder (Protected) */}
          <Route
            path="/insights"
            element={
              <ProtectedRoute>
                <DashboardLayout activePage="insights">
                  <InsightsContent />
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
          </BrowserRouter>
        </DataProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
