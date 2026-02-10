import { useNavigate } from 'react-router-dom';
import { useAppReady } from '../../context/AppReadyContext';
import { useAuth } from '../../context/AuthContext';
import Skeleton from '../primitives/Skeleton';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * RequireAccess - Auth/boot guard for authenticated-only content.
 *
 * All signed-in users have full access. This component ensures:
 * - Boot is complete
 * - User is authenticated
 *
 * @param {ReactNode} children - Content to render
 * @param {ReactNode} [fallback] - Custom loading state (default: Skeleton)
 */
export function RequireAccess({ children, fallback }) {
  const navigate = useNavigate();
  const { authenticatedReady, proReady } = useAppReady();
  const { isAuthenticated } = useAuth();
  const ready = authenticatedReady ?? proReady ?? true;
  const status = ready ? 'ready' : 'pending';

  if (status === 'pending') {
    return fallback ?? <DefaultSkeleton />;
  }

  if (!ready) {
    return fallback ?? <DefaultSkeleton />;
  }

  if (!isAuthenticated) {
    return (
      <AuthRequiredState onRetry={() => navigate('/login')} />
    );
  }

  return children;
}

/**
 * Default skeleton for RequireAccess loading state
 */
function DefaultSkeleton() {
  return (
    <div className="w-full h-48 p-4">
      <Skeleton className="w-full h-full rounded-lg" />
    </div>
  );
}

/**
 * Auth state with sign-in retry button.
 */
function AuthRequiredState({ onRetry }) {
  return (
    <div className="w-full p-6 rounded-lg bg-mono-base/50 border border-red-500/20">
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <div>
          <p className="text-sm font-semibold text-mono-ink">
            Sign in required
          </p>
          <p className="text-xs text-mono-mid mt-1">
            Please sign in with Google to continue
          </p>
        </div>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 mt-2 bg-brand-navy text-white
                     rounded-lg font-medium text-sm hover:bg-brand-navy/90
                     transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Sign In
        </button>
      </div>
    </div>
  );
}

// Compatibility alias for existing imports.
export const RequirePro = RequireAccess;
export default RequireAccess;
