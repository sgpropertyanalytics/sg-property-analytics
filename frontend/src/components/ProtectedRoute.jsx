import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute - Auth guard for dashboard routes
 *
 * Redirects unauthenticated users to /login while preserving
 * the originally requested URL for post-login redirect.
 *
 * IMPORTANT: Only shows loading state during INITIAL auth check.
 * Once initialized, we never show loading again to prevent layout unmount
 * during navigation (which causes nav rail flicker).
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

  // Show loading state ONLY during initial auth check
  // Once initialized, keep showing children to prevent layout flicker
  // This prevents DashboardLayout from unmounting during navigation
  if (!initialized) {
    return (
      <div className="min-h-screen bg-[#EAE0CF]/30 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#213448] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#547792]">Loading...</p>
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
