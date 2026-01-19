import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute - Auth guard for dashboard routes
 *
 * Tier 2.1 fix: Now checks BOTH Firebase auth AND backend session status.
 * Prevents "logged in but broken" state where Firebase is valid but JWT expired.
 *
 * Redirects unauthenticated users to /login while preserving
 * the originally requested URL for post-login redirect.
 *
 * Shows a layout skeleton during auth initialization that closely matches
 * the actual DashboardLayout structure. This prevents jarring transitions
 * while ensuring auth is complete before rendering protected content.
 *
 * Usage:
 *   <Route path="/market-pulse" element={
 *     <ProtectedRoute>
 *       <DashboardLayout>...</DashboardLayout>
 *     </ProtectedRoute>
 *   } />
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, initialized, authPhase } = useAuth();
  const location = useLocation();

  // Show layout skeleton during auth initialization
  // This matches DashboardLayout structure to minimize visual shift
  if (!initialized) {
    return (
      <div className="flex h-screen bg-brand-sand/30">
        {/* Nav rail skeleton - matches GlobalNavRail dimensions */}
        <div className="hidden lg:flex flex-col w-20 bg-brand-navy flex-shrink-0">
          {/* Logo area */}
          <div className="h-16 flex items-center justify-center border-b border-brand-blue/30">
            <div className="w-10 h-10 rounded-lg bg-brand-blue/30 animate-pulse" />
          </div>
          {/* Nav items */}
          <div className="flex-1 py-4 space-y-2 px-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-brand-blue/20 animate-pulse" />
            ))}
          </div>
          {/* User area */}
          <div className="p-3 border-t border-brand-blue/30">
            <div className="h-10 rounded-lg bg-brand-blue/20 animate-pulse" />
          </div>
        </div>

        {/* Mobile header skeleton */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-brand-navy z-50 flex items-center px-4">
          <div className="w-10 h-10 rounded bg-brand-blue/30 animate-pulse" />
          <div className="ml-3 flex-1" />
          <div className="w-10 h-10 rounded bg-brand-blue/30 animate-pulse" />
        </div>

        {/* Main content area with loading */}
        <div className="flex-1 flex items-center justify-center lg:mt-0 mt-14">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-brand-navy border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-brand-blue">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Tier 2.1: Wait for backend session to be established
  // Prevents accessing dashboard with Firebase auth but expired JWT
  // authPhase states: idle | syncing | established | retrying | error
  // - 'established': Backend session active, allow access
  // - 'retrying': Retry in progress, allow access (degraded mode)
  // - 'syncing' or 'idle': Still syncing, show skeleton
  // - 'error': Auth failed, user will be null, redirect below
  if (isAuthenticated && authPhase !== 'established' && authPhase !== 'retrying' && authPhase !== 'error') {
    // User authenticated with Firebase, but backend sync not complete yet
    // Show skeleton while waiting (prevents API 401 loop)
    return (
      <div className="flex h-screen bg-brand-sand/30">
        {/* Same skeleton as initialization */}
        <div className="hidden lg:flex flex-col w-20 bg-brand-navy flex-shrink-0">
          <div className="h-16 flex items-center justify-center border-b border-brand-blue/30">
            <div className="w-10 h-10 rounded-lg bg-brand-blue/30 animate-pulse" />
          </div>
          <div className="flex-1 py-4 space-y-2 px-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-brand-blue/20 animate-pulse" />
            ))}
          </div>
          <div className="p-3 border-t border-brand-blue/30">
            <div className="h-10 rounded-lg bg-brand-blue/20 animate-pulse" />
          </div>
        </div>
        <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-brand-navy z-50 flex items-center px-4">
          <div className="w-10 h-10 rounded bg-brand-blue/30 animate-pulse" />
          <div className="ml-3 flex-1" />
          <div className="w-10 h-10 rounded bg-brand-blue/30 animate-pulse" />
        </div>
        <div className="flex-1 flex items-center justify-center lg:mt-0 mt-14">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-brand-navy border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-brand-blue">Syncing with server...</p>
          </div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
