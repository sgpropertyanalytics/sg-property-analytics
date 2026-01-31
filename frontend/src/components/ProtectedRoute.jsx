import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute - Auth guard for dashboard routes
 *
 * Three states:
 * 1. Loading skeleton (not initialized)
 * 2. Redirect to login (not authenticated)
 * 3. Render children (authenticated)
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, initialized } = useAuth();
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="flex h-screen bg-brand-sand/30">
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
            <p className="text-sm text-brand-blue">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
