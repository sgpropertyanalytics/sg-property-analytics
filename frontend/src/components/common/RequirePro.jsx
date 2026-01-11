import { useNavigate } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAppReady } from '../../context/AppReadyContext';
import { useAuth } from '../../context/AuthContext';
import Skeleton from '../primitives/Skeleton';
import { Lock, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * RequirePro - Hard paywall gate for premium content
 *
 * CRITICAL INVARIANT (P0 Fix):
 * Children are NOT mounted (and cannot fetch) unless:
 * 1. proReady = true (subscription resolved)
 * 2. User is premium
 *
 * This is NOT blur/overlay - children literally don't exist for free users.
 * This prevents premium API calls from executing before we know the user's tier.
 *
 * UI GATING RULES:
 * - isPending: Show skeleton (NEVER paywall)
 * - !proReady: Show skeleton (boot not complete)
 * - isError: Show retry UI (not paywall, not content)
 * - isFreeResolved: Show paywall (children never mount)
 * - isPremiumResolved: Show content (children mount)
 *
 * Usage:
 * ```jsx
 * <RequirePro>
 *   <PremiumInsightsChart />
 * </RequirePro>
 *
 * <RequirePro fallback={<CustomLoader />}>
 *   <DetailedAnalyticsChart />
 * </RequirePro>
 * ```
 *
 * @param {ReactNode} children - Premium content to render
 * @param {ReactNode} [fallback] - Custom loading state (default: Skeleton)
 * @param {string} [feature] - Feature name for analytics
 */
export function RequirePro({ children, fallback, feature = 'premium content' }) {
  const navigate = useNavigate();
  const { proReady } = useAppReady();
  const { isAuthenticated } = useAuth();
  const {
    isPremiumResolved,
    isFreeResolved,
    isError,
    isPending,
    showPaywall,
    ensureSubscription,
  } = useSubscription();

  // SAFETY: Explicit pending check (robust even if proReady is true too early)
  // UI INVARIANT: isPending = loading OR initial; use for safety guards
  if (isPending) {
    return fallback ?? <DefaultSkeleton />;
  }

  // Still booting - show skeleton (not paywall)
  // This prevents paywall flash during auth/filter hydration
  if (!proReady) {
    return fallback ?? <DefaultSkeleton />;
  }

  // Subscription error - show retry UI (not paywall, not content)
  // SUBSCRIPTION INVARIANT: ERROR !== FREE. ERROR = unknown, show retry UI
  if (isError) {
    return (
      <SubscriptionErrorState
        onRetry={ensureSubscription}
      />
    );
  }

  // Free user - HARD PAYWALL (children never mount, never fetch)
  if (isFreeResolved) {
    return (
      <Paywall
        isAuthenticated={isAuthenticated}
        feature={feature}
        onUpgrade={() => showPaywall({ source: 'require-pro', field: feature })}
        onSignIn={() => navigate('/login')}
      />
    );
  }

  // Premium user - mount children (they can now fetch)
  if (isPremiumResolved) {
    return children;
  }

  // Fallback (should not reach if states are exhaustive)
  // This handles any edge case where subscription state is unexpected
  return fallback ?? <DefaultSkeleton />;
}

/**
 * Default skeleton for RequirePro loading state
 */
function DefaultSkeleton() {
  return (
    <div className="w-full h-48 p-4">
      <Skeleton className="w-full h-full rounded-lg" />
    </div>
  );
}

/**
 * Subscription error state with retry button
 * Shown when subscription fetch fails
 */
function SubscriptionErrorState({ onRetry }) {
  return (
    <div className="w-full p-6 rounded-lg bg-mono-base/50 border border-red-500/20">
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <div>
          <p className="text-sm font-semibold text-mono-ink">
            Unable to verify subscription
          </p>
          <p className="text-xs text-mono-mid mt-1">
            Please check your connection and try again
          </p>
        </div>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 mt-2 bg-brand-navy text-white
                     rounded-lg font-medium text-sm hover:bg-brand-navy/90
                     transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    </div>
  );
}

/**
 * Paywall component for free users
 * Hard paywall - content is not rendered at all
 */
function Paywall({ isAuthenticated, feature, onUpgrade, onSignIn }) {
  return (
    <div className="w-full p-6 rounded-lg bg-gradient-to-b from-brand-navy/5 to-brand-navy/10 border border-brand-navy/20">
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-brand-navy/10 flex items-center justify-center">
          <Lock className="w-6 h-6 text-brand-navy" />
        </div>
        <div>
          <p className="text-base font-semibold text-mono-ink">
            Premium Feature
          </p>
          <p className="text-sm text-mono-mid mt-1 max-w-xs">
            Upgrade to access {feature} and unlock detailed analytics
          </p>
        </div>
        <button
          onClick={isAuthenticated ? onUpgrade : onSignIn}
          className="flex items-center gap-2 px-6 py-2.5 bg-brand-navy text-white
                     rounded-lg font-semibold text-sm hover:bg-brand-navy/90
                     transition-colors shadow-md"
        >
          <Lock className="w-4 h-4" />
          {isAuthenticated ? 'Upgrade to Pro' : 'Sign In to Unlock'}
        </button>
      </div>
    </div>
  );
}

export default RequirePro;
