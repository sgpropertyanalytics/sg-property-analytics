import { useEffect, useState, useCallback } from 'react';
import { useSubscription } from '../../context/SubscriptionContext';

/**
 * PreviewChartOverlay - Selective blur for Chart.js plot areas
 *
 * Keeps axes, legends, titles SHARP while blurring only the data area.
 * Uses Chart.js chartArea coordinates to position overlay precisely.
 *
 * Visual Effects:
 * - backdrop-filter: blur(4px) - Soft blur (not heavy)
 * - filter: grayscale(40%) - Desaturation signals "inactive"
 * - background: rgba(255,255,255,0.05) - Subtle frost effect
 *
 * Usage:
 *   <PreviewChartOverlay chartRef={chartRef}>
 *     <Chart ref={chartRef} type="bar" data={chartData} options={options} />
 *   </PreviewChartOverlay>
 */
export function PreviewChartOverlay({ chartRef, children }) {
  const subscriptionContext = useSubscription();
  const isPremium = subscriptionContext?.isPremium ?? true; // Default to premium if context unavailable
  // P0 FIX: Check if tier is known (not 'unknown' loading state)
  // When tier is unknown, don't show blur - ChartFrame shows skeleton instead
  const isTierKnown = subscriptionContext?.isTierKnown ?? true;
  const [overlayBounds, setOverlayBounds] = useState(null);

  const updateBounds = useCallback(() => {
    const chart = chartRef?.current;
    if (!chart || !chart.chartArea) return;

    const { left, top, width, height } = chart.chartArea;
    setOverlayBounds({ left, top, width, height });
  }, [chartRef]);

  useEffect(() => {
    // Premium users don't need overlay
    // P0 FIX: Also skip overlay when tier is unknown (loading state)
    // ChartFrame shows skeleton during boot - we don't want blur AND skeleton
    if (isPremium || !isTierKnown) {
      setOverlayBounds(null);
      return;
    }

    // Poll for chart availability and updates
    // This is safer than mutating chart.options
    let intervalId;
    let timeoutId;

    const checkAndUpdate = () => {
      const chart = chartRef?.current;
      if (chart && chart.chartArea) {
        updateBounds();
      }
    };

    // Initial delay to let chart render
    timeoutId = setTimeout(() => {
      checkAndUpdate();
      // Then poll periodically for chart updates (filter changes, etc.)
      intervalId = setInterval(checkAndUpdate, 500);
    }, 200);

    // Also use ResizeObserver for resize updates
    let resizeObserver;
    const chart = chartRef?.current;
    if (chart?.canvas) {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(checkAndUpdate);
      });
      resizeObserver.observe(chart.canvas);
    }

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      resizeObserver?.disconnect();
    };
  }, [isPremium, isTierKnown, chartRef, updateBounds]);

  // Premium users see charts normally
  // P0 FIX: Also skip overlay when tier is unknown (loading state)
  if (isPremium || !isTierKnown) {
    return <>{children}</>;
  }

  return (
    <div className="relative h-full w-full">
      {children}

      {/* Selective blur overlay - only covers plot area */}
      {overlayBounds && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: overlayBounds.left,
            top: overlayBounds.top,
            width: overlayBounds.width,
            height: overlayBounds.height,
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)', // Safari
            filter: 'grayscale(40%)',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '2px',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default PreviewChartOverlay;
