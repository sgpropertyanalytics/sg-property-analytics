import { useLocation } from 'react-router-dom';
import { useAppReady } from '../../context/AppReadyContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';

// Public routes that don't need auth/subscription - don't show banner here
const PUBLIC_ROUTES = ['/', '/landing', '/login', '/pricing'];

/**
 * BootStuckBanner - Recovery UI when boot is slow or stuck
 *
 * Two phases:
 * - isBootSlow (>5s): Shows "Backend may be waking up" with spinner
 * - isBootStuck (>10s): Shows "Loading stuck" with retry button
 *
 * This provides better UX during Render cold starts, which can take 5-30s.
 *
 * The retry button triggers BOTH:
 * - Token sync retry (AuthContext.retryTokenSync)
 * - Subscription refresh (SubscriptionContext.actions.refresh)
 *
 * Usage: Add to App.jsx layout, outside main content
 */
export function BootStuckBanner() {
  const location = useLocation();
  const { bootStatus, banners } = useAppReady();
  const { actions } = useSubscription();
  const { retryTokenSync, isAuthenticated } = useAuth();

  // Don't show on public routes - they don't need auth/subscription
  if (PUBLIC_ROUTES.includes(location.pathname)) return null;

  const usingCachedTier = Boolean(banners?.usingCachedTier) && isAuthenticated;
  const isBootSlow = bootStatus === 'slow';
  const isBootStuck = bootStatus === 'stuck';

  // Show nothing if boot is normal (<5s) and not using cached access
  if (!isBootSlow && !isBootStuck && !usingCachedTier) return null;

  const handleRetry = () => {
    // Retry BOTH to break potential deadlock
    retryTokenSync();
    actions.refresh();
  };

  // Phase 1: Boot slow (5-10s) - likely cold start, show reassuring message
  if (isBootSlow && !isBootStuck) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center justify-between">
        <span className="text-blue-800 text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Backend may be waking up… retrying automatically
        </span>
      </div>
    );
  }

  if (usingCachedTier && !isBootSlow && !isBootStuck) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center justify-between">
        <span className="text-blue-800 text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Using cached access — reconnecting…
        </span>
      </div>
    );
  }

  // Phase 2: Boot stuck (>10s) - show retry button
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between">
      <span className="text-amber-800 text-sm">
        Loading taking longer than expected.
      </span>
      <button
        onClick={handleRetry}
        className="text-amber-900 font-medium text-sm underline hover:text-amber-700"
      >
        Retry
      </button>
    </div>
  );
}

export default BootStuckBanner;
