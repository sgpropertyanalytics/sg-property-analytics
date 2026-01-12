import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FrostProgressBar } from './FrostProgressBar';

/**
 * TechOverlay - HUD-style loading overlay with data calibration aesthetic
 *
 * Design Philosophy:
 * - Replaces soft blur with technical "calibrating" indicator
 * - Shows animated data bars like an equalizer processing data
 * - Monospace terminal text for status messages
 *
 * States:
 * - Initial load: Full overlay with calibration bars + message
 * - Refreshing: Light overlay with progress bar only
 * - Clearing: Fade out with content reveal
 *
 * @param {boolean} visible - Whether to show the overlay
 * @param {boolean} showSpinner - Show calibration bars (default: true for initial)
 * @param {boolean} showProgress - Show top progress bar (default: true)
 * @param {boolean} isRefreshing - Use lighter overlay for refresh state
 * @param {number} height - Container height
 * @param {number} staggerIndex - Cascade delay index
 * @param {string} message - Status message (default: "CALIBRATING DATA STREAM")
 * @param {React.ReactNode} children - Content to render behind overlay
 */
export const TechOverlay = React.memo(function TechOverlay({
  visible = true,
  showSpinner = true,
  showProgress = true,
  isRefreshing = false,
  height = 300,
  staggerIndex = 0,
  message = 'CALIBRATING',
  children,
}) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Overlay opacity based on state
  const bgOpacity = isRefreshing ? 0.4 : 0.6;
  const blurAmount = isRefreshing ? 2 : 4;

  // Animation timing
  const duration = prefersReducedMotion ? 0 : 0.3;
  const staggerDelay = prefersReducedMotion ? 0 : staggerIndex * 0.05;

  // Content reveal animation
  const contentVariants = {
    hidden: { opacity: 0.3 },
    visible: { opacity: 1 },
  };

  // Overlay fade animation
  const overlayVariants = {
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };

  return (
    <div
      className="relative overflow-hidden"
      style={{ minHeight: height }}
      aria-busy={visible}
    >
      {/* Background content */}
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

      {/* Schematic grid background when no children */}
      {!children && (
        <div className="absolute inset-0 z-0 schematic-grid" />
      )}

      {/* Tech overlay */}
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
              backgroundColor: `rgba(255, 255, 255, ${bgOpacity})`,
            }}
          >
            {/* Progress bar at top */}
            {showProgress && <FrostProgressBar visible />}

            {/* Calibration indicator */}
            {showSpinner && (
              <div className="relative z-10 flex flex-col items-center gap-3">
                {/* Animated data bars - equalizer style */}
                <CalibrationBars />

                {/* Monospace status message with blinking cursor */}
                <div className="font-mono text-[10px] tracking-[0.2em] text-gray-500 uppercase">
                  {message}
                  <span className="animate-blink">_</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screen reader announcement */}
      <span className="sr-only" aria-live="polite">
        {visible ? 'Processing data' : 'Data ready'}
      </span>
    </div>
  );
});

/**
 * CalibrationBars - Animated equalizer-style bars
 * Simulates data processing/calibration activity
 */
function CalibrationBars() {
  // 5 bars with staggered animations
  const bars = [
    { delay: '0s', baseHeight: 30 },
    { delay: '0.1s', baseHeight: 50 },
    { delay: '0.2s', baseHeight: 70 },
    { delay: '0.15s', baseHeight: 40 },
    { delay: '0.25s', baseHeight: 60 },
  ];

  return (
    <div className="flex gap-1 h-8 items-end">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="w-1.5 bg-gray-800 calibrate-bar"
          style={{
            animationDelay: bar.delay,
            minHeight: '4px',
          }}
        />
      ))}
    </div>
  );
}

/**
 * TechRefreshOverlay - Lighter overlay for refresh state
 */
export const TechRefreshOverlay = React.memo(function TechRefreshOverlay({
  visible = true,
  height = 300,
  children,
}) {
  return (
    <TechOverlay
      visible={visible}
      showSpinner={false}
      showProgress={true}
      isRefreshing={true}
      height={height}
      message="UPDATING"
    >
      {children}
    </TechOverlay>
  );
});

export default TechOverlay;
