import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * FrostProgressBar - Thin indeterminate progress bar
 *
 * A 2px height progress bar that slides across the top edge.
 * Uses a gradient from transparent to slate-700 (#334155) to transparent.
 *
 * @param {boolean} visible - Whether to show the progress bar
 * @param {string} position - 'top' | 'bottom' (default: 'top')
 */
export const FrostProgressBar = React.memo(function FrostProgressBar({
  visible = true,
  position = 'top',
}) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const positionClass = position === 'top' ? 'top-0' : 'bottom-0';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`absolute ${positionClass} left-0 right-0 h-0.5 overflow-hidden z-20`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {prefersReducedMotion ? (
            // Reduced motion: static gradient bar
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#334155] to-transparent opacity-60" />
          ) : (
            // Animated sliding bar
            <motion.div
              className="absolute h-full w-1/3 bg-gradient-to-r from-transparent via-[#334155] to-transparent"
              animate={{
                x: ['-100%', '400%'],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default FrostProgressBar;
