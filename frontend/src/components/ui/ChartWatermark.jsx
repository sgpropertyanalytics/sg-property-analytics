import { useSubscription } from '../../context/SubscriptionContext';

/**
 * ChartWatermark - Visual safeguard for preview mode
 *
 * Adds a subtle "PREVIEW" watermark overlay to charts for free users.
 * Premium users see charts without any watermark.
 *
 * Usage:
 *   <ChartWatermark>
 *     <TimeTrendChart />
 *   </ChartWatermark>
 *
 * The watermark is:
 * - Semi-transparent (doesn't obstruct data viewing)
 * - Rotated for visual distinction
 * - Non-interactive (pointer-events-none)
 */
export function ChartWatermark({ children }) {
  const { isPremium } = useSubscription();

  // Premium users see charts without watermark
  if (isPremium) {
    return children;
  }

  return (
    <div className="relative">
      {children}
      {/* Watermark overlay - subtle, non-obstructive */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <span
          className="text-[#94B4C1]/20 text-4xl md:text-5xl font-bold select-none whitespace-nowrap"
          style={{ transform: 'rotate(-15deg)' }}
        >
          PREVIEW
        </span>
      </div>
    </div>
  );
}

export default ChartWatermark;
