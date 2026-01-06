import { useLocation } from 'react-router-dom';
import { useAppReady } from '../../context/AppReadyContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';

// Public routes that don't need auth/subscription - don't show banner here
const PUBLIC_ROUTES = ['/', '/landing', '/login', '/pricing'];

/**
 * BootStuckBanner - Recovery UI when boot is stuck >10s
 *
 * Shows a banner with retry button that triggers BOTH:
 * - Token sync retry (AuthContext.retryTokenSync)
 * - Subscription retry (SubscriptionContext.retrySubscription)
 *
 * This breaks the deadlock where:
 * - tokenStatus='error' blocks subscription fetch
 * - subscription never resolves
 * - appReady stays false forever
 *
 * Usage: Add to App.jsx layout, outside main content
 */
export function BootStuckBanner() {
  const location = useLocation();
  const { isBootStuck, bootStatus } = useAppReady();
  const { retrySubscription } = useSubscription();
  const { retryTokenSync } = useAuth();

  // Don't show on public routes - they don't need auth/subscription
  if (PUBLIC_ROUTES.includes(location.pathname)) return null;
  
  if (!isBootStuck) return null;

  const handleRetry = () => {
    // Retry BOTH to break potential deadlock
    retryTokenSync();
    retrySubscription();
  };

  // Build list of what's blocking boot
  const blockedBy = [];
  if (!bootStatus?.authInitialized) blockedBy.push('authentication');
  if (!bootStatus?.isSubscriptionReady) blockedBy.push('subscription');
  if (!bootStatus?.filtersReady) blockedBy.push('filters');

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between">
      <span className="text-amber-800 text-sm">
        Loading taking longer than expected
        {blockedBy.length > 0 && ` (${blockedBy.join(', ')})`}.
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
