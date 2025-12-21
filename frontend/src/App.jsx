import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import LandingPage from './pages/Landing';
import Login from './pages/Login';
import { DashboardLayout } from './components/layout';
import { MacroOverviewContent } from './pages/MacroOverview';
import { ProjectAnalysisContent } from './pages/ProjectAnalysis';
import { AnalyticsViewContent } from './pages/AnalyticsView';
import { InsightsContent } from './pages/Insights';
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
 * - /project-analysis: Individual project deep-dives (premium)
 * - /value-parity: Budget search tool (premium)
 * - /analytics-view: Power BI-style analytics (premium)
 * - /insights: AI-powered market insights (premium)
 */
function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          {/* ===== Public Routes (No Dashboard Layout) ===== */}

          {/* Landing Page - Public home page */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/landing" element={<LandingPage />} />

          {/* Login - Authentication */}
          <Route path="/login" element={<Login />} />

          {/* ===== Dashboard Routes with Double-Sidebar Layout ===== */}

          {/* Market Pulse - Main analytics dashboard */}
          <Route
            path="/market-pulse"
            element={
              <DashboardLayout activePage="market-pulse">
                <MacroOverviewContent />
              </DashboardLayout>
            }
          />

          {/* Project Analysis - Placeholder */}
          <Route
            path="/project-analysis"
            element={
              <DashboardLayout activePage="project-analysis">
                <ProjectAnalysisContent />
              </DashboardLayout>
            }
          />

          {/* Value Parity Tool - No filter sidebar */}
          <Route
            path="/value-parity"
            element={
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
            }
          />

          {/* Analytics View - Pinned filter sidebar */}
          <Route
            path="/analytics-view"
            element={
              <DashboardLayout activePage="analytics-view">
                <AnalyticsViewContent />
              </DashboardLayout>
            }
          />

          {/* Insights - Placeholder */}
          <Route
            path="/insights"
            element={
              <DashboardLayout activePage="insights">
                <InsightsContent />
              </DashboardLayout>
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
  );
}

export default App;
