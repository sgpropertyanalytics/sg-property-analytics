import { useSubscription } from '../../context/SubscriptionContext';

/**
 * BlurredDashboard - Wrapper that blurs content for free users
 *
 * For free users:
 * - Applies 6px blur to all children
 * - Disables pointer events (no interaction)
 * - Prevents text selection
 *
 * For premium users:
 * - Renders children normally without any modifications
 */
export function BlurredDashboard({ children }) {
  const { isPremium } = useSubscription();

  // Premium users see everything normally
  if (isPremium) {
    return <>{children}</>;
  }

  // Free users see blurred content
  return (
    <div className="blur-[6px] pointer-events-none select-none transition-[filter] duration-300">
      {children}
    </div>
  );
}

export default BlurredDashboard;
