import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute - Auth guard for dashboard routes
 *
 * Redirects unauthenticated users to /login while preserving
 * the originally requested URL for post-login redirect.
 *
 * IMPORTANT: Shows navbar skeleton during auth initialization to prevent
 * the jarring "blank screen" experience. The main content area shows a
 * loading spinner while auth is being verified.
 *
 * Usage:
 *   <Route path="/market-pulse" element={
 *     <ProtectedRoute>
 *       <DashboardLayout>...</DashboardLayout>
 *     </ProtectedRoute>
 *   } />
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, initialized } = useAuth();
  const location = useLocation();

  // Show layout shell with navbar during initial auth check
  // This prevents the "navbar disappearing" issue during slow backend sync
  if (!initialized) {
    return (
      <div className="flex h-screen bg-[#EAE0CF]/30">
        {/* Nav rail skeleton - matches GlobalNavRail structure */}
        <div className="hidden lg:flex flex-col w-20 bg-[#213448] border-r border-[#547792]/30 flex-shrink-0">
          {/* Logo area */}
          <div className="h-16 flex items-center justify-center border-b border-[#547792]/30">
            <div className="w-10 h-10 rounded-lg bg-[#547792]/30 animate-pulse" />
          </div>
          {/* Nav items skeleton */}
          <div className="flex-1 py-4 space-y-2 px-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-[#547792]/20 animate-pulse" />
            ))}
          </div>
          {/* User area skeleton */}
          <div className="p-3 border-t border-[#547792]/30">
            <div className="h-10 rounded-lg bg-[#547792]/20 animate-pulse" />
          </div>
        </div>

        {/* Mobile header skeleton */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#213448] z-50 flex items-center px-4">
          <div className="w-8 h-8 rounded bg-[#547792]/30 animate-pulse" />
          <div className="ml-3 h-6 w-32 rounded bg-[#547792]/30 animate-pulse" />
        </div>

        {/* Main content loading */}
        <div className="flex-1 flex items-center justify-center lg:mt-0 mt-14">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#213448] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-[#547792]">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  // Pass the current location so we can redirect back after login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
