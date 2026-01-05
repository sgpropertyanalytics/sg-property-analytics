import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FrostSpinner } from './FrostSpinner';
import { FrostProgressBar } from './FrostProgressBar';
import { ChartBlueprint } from './ChartBlueprint';

/**
 * FrostOverlay - Glassmorphism loading overlay with premium transitions
 *
 * A frosted glass overlay that covers content during loading.
 * Features "curtain lift" exit and "focus reveal" for content.
 *
 * States:
 * - Initial load: Full frost (blur 8px) with centered spinner
 * - Refreshing: Light frost (blur 4px) with progress bar only
 * - Clearing: Curtain lifts up while content scales + de-blurs
 *
 * @param {boolean} visible - Whether to show the overlay
 * @param {boolean} showSpinner - Show centered spinner (default: true for initial, false for refresh)
 * @param {boolean} showProgress - Show top progress bar (default: true)
 * @param {boolean} isRefreshing - Use lighter frost for refresh state
 * @param {number} height - Container height
 * @param {number} staggerIndex - Cascade delay index (0=first, 1=+50ms, 2=+100ms, etc.)
 * @param {React.ReactNode} children - Content to render behind frost (optional)
 */
export const FrostOverlay = React.memo(function FrostOverlay({
  visible = true,
  showSpinner = true,
  showProgress = true,
  isRefreshing = false,
  height = 300,
  staggerIndex = 0,
  children,
}) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Frost intensity based on state
  const blurAmount = isRefreshing ? 4 : 8;
  const bgOpacity = isRefreshing ? 0.4 : 0.6;

  // Animation timing
  const duration = prefersReducedMotion ? 0 : 0.4;
  const staggerDelay = prefersReducedMotion ? 0 : staggerIndex * 0.05; // 50ms per index

  // Content reveal animation (scale + blur like camera focus)
  const contentVariants = {
    hidden: { scale: 0.98, filter: 'blur(4px)' },
    visible: { scale: 1, filter: 'blur(0px)' },
  };

  // Overlay curtain lift animation
  const overlayVariants = {
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
  };

  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{ minHeight: height }}
      aria-busy={visible}
    >
      {/* Background content with reveal animation */}
      {children && (
        <motion.div
          className="absolute inset-0"
          initial="hidden"
          animate={visible ? 'hidden' : 'visible'}
          variants={contentVariants}
          transition={{ duration, ease: 'easeOut', delay: staggerDelay }}
        >
          {children}
        </motion.div>
      )}

      {/* Blueprint layer when no children - gives frost something to blur */}
      {!children && (
        <div className="absolute inset-0 z-0 bg-card p-4 text-[#94B4C1]/20">
          <ChartBlueprint />
        </div>
      )}

      {/* Frost overlay with curtain lift */}
      <AnimatePresence>
        {visible && (
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center"
            initial="visible"
            animate="visible"
            exit="exit"
            variants={overlayVariants}
            transition={{ duration, ease: 'easeOut', delay: staggerDelay }}
            style={{
              backdropFilter: `blur(${blurAmount}px)`,
              WebkitBackdropFilter: `blur(${blurAmount}px)`,
              backgroundColor: `rgba(254, 254, 254, ${bgOpacity})`,
            }}
          >
            {/* Progress bar at top */}
            {showProgress && <FrostProgressBar visible />}

            {/* Centered spinner */}
            {showSpinner && (
              <div className="flex flex-col items-center gap-3">
                <FrostSpinner size="md" />
                <span className="text-sm text-[#547792] font-medium">
                  Loading
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screen reader announcement */}
      <span className="sr-only" aria-live="polite">
        {visible ? 'Loading data' : 'Data loaded'}
      </span>
    </div>
  );
});

/**
 * FrostRefreshOverlay - Lighter overlay for refresh state
 *
 * A simpler overlay for when we have prior data and just need
 * to indicate a background refresh is happening.
 */
export const FrostRefreshOverlay = React.memo(function FrostRefreshOverlay({
  visible = true,
  height = 300,
  children,
}) {
  return (
    <FrostOverlay
      visible={visible}
      showSpinner={false}
      showProgress={true}
      isRefreshing={true}
      height={height}
    >
      {children}
    </FrostOverlay>
  );
});

export default FrostOverlay;
