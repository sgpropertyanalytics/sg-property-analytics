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
  const [overlayBounds, setOverlayBounds] = useState(null);

  const updateBounds = useCallback(() => {
    const chart = chartRef?.current;
    if (!chart || !chart.chartArea) return;

    const { left, top, width, height } = chart.chartArea;
    setOverlayBounds({ left, top, width, height });
  }, [chartRef]);

  useEffect(() => {
    // Premium users don't need overlay
    if (isPremium) {
      setOverlayBounds(null);
      return;
    }

    const chart = chartRef?.current;
    if (!chart) return;

    // Initial update after a brief delay to ensure chart is rendered
    const initialTimeout = setTimeout(updateBounds, 100);

    // Update on resize using ResizeObserver
    let resizeObserver;
    if (chart.canvas) {
      resizeObserver = new ResizeObserver(() => {
        // Debounce resize updates
        requestAnimationFrame(updateBounds);
      });
      resizeObserver.observe(chart.canvas);
    }

    // Also listen for chart updates (filter changes cause re-renders)
    const animationEndHandler = () => updateBounds();
    chart.options = chart.options || {};
    const originalOnComplete = chart.options.animation?.onComplete;
    chart.options.animation = {
      ...chart.options.animation,
      onComplete: (animation) => {
        originalOnComplete?.(animation);
        animationEndHandler();
      },
    };

    return () => {
      clearTimeout(initialTimeout);
      resizeObserver?.disconnect();
    };
  }, [isPremium, chartRef, updateBounds]);

  // Premium users see charts normally
  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
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
