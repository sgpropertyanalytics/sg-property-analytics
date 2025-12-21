import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import Login from './pages/Login';
import { DashboardLayout } from './components/layout';
import { MacroOverviewContent } from './pages/MacroOverview';
import { ProjectAnalysisContent } from './pages/ProjectAnalysis';
import { AnalyticsViewContent } from './pages/AnalyticsView';
import { InsightsContent } from './pages/Insights';
import { ValueParityPanel } from './components/ValueParityPanel';

/**
 * App Component with Double-Sidebar Navigation
 *
 * Layout Structure:
 * - DashboardLayout wraps all dashboard pages
 * - GlobalNavRail (64px) provides primary navigation
 * - PowerBIFilterSidebar (280px) provides contextual filtering
 * - Main content area displays page-specific content
 *
 * Routes:
 * - /market-pulse: Market analytics dashboard (default)
 * - /project-analysis: Individual project deep-dives
 * - /value-parity: Budget search tool (no filter sidebar)
 * - /analytics-view: Power BI-style analytics (pinned filter sidebar)
 * - /insights: AI-powered market insights
 */
function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          {/* Login - No dashboard layout */}
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

          {/* Default route -> Market Pulse */}
          <Route path="/" element={<Navigate to="/market-pulse" replace />} />

          {/* Legacy route redirects */}
          <Route path="/analytics" element={<Navigate to="/market-pulse" replace />} />
          <Route path="/dashboard" element={<Navigate to="/market-pulse" replace />} />
          <Route path="/macro-overview" element={<Navigate to="/market-pulse" replace />} />

          {/* Catch-all -> Market Pulse */}
          <Route path="*" element={<Navigate to="/market-pulse" replace />} />
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}

export default App;
