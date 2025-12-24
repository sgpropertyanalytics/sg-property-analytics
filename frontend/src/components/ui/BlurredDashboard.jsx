import { useSubscription } from '../../context/SubscriptionContext';

/**
 * BlurredDashboard - Wrapper that blurs chart content for free users
 *
 * For free users:
 * - Applies 4px blur (light enough to see shapes, obscures details)
 * - Disables pointer events (no interaction)
 * - Prevents text selection
 *
 * For premium users:
 * - Renders children normally without any modifications
 *
 * Usage: Wrap individual charts, not entire page sections
 *   <BlurredDashboard>
 *     <TimeTrendChart />
 *   </BlurredDashboard>
 */
export function BlurredDashboard({ children }) {
  const { isPremium } = useSubscription();

  // Premium users see everything normally
  if (isPremium) {
    return <>{children}</>;
  }

  // Free users see blurred content (4px - lighter blur to see chart shapes)
  return (
    <div className="blur-[4px] pointer-events-none select-none transition-[filter] duration-300">
      {children}
    </div>
  );
}

export default BlurredDashboard;
