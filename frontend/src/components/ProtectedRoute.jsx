import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute - Auth guard for dashboard routes
 *
 * Redirects unauthenticated users to /login while preserving
 * the originally requested URL for post-login redirect.
 *
 * IMPORTANT: Always renders children (DashboardLayout) immediately.
 * This keeps the real navbar visible at all times - no skeleton, no flicker.
 * The content area handles its own loading state via Suspense.
 *
 * Flow:
 * 1. Not initialized → Render layout, content area shows loading (via DashboardLayout)
 * 2. Initialized + not authenticated → Redirect to /login
 * 3. Initialized + authenticated → Render normally
 *
 * Usage:
 *   <Route path="/market-pulse" element={
 *     <ProtectedRoute>
 *       <DashboardLayout>...</DashboardLayout>
 *     </ProtectedRoute>
 *   } />
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, initialized } = useAuth();
  const location = useLocation();

  // Only redirect AFTER initialization is complete
  // This prevents redirect during slow backend sync
  if (initialized && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Always render children (DashboardLayout with real navbar)
  // During auth initialization, the navbar stays visible
  // Content area loading is handled by DashboardLayout's Suspense
  return children;
}

export default ProtectedRoute;
