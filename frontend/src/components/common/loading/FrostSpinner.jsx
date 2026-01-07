import React from 'react';
import { motion } from 'framer-motion';

/**
 * FrostSpinner - Minimal pulsing dots spinner
 *
 * Three dots that pulse in sequence, creating a smooth loading indicator.
 * Uses the design system slate-700 color (#334155).
 *
 * @param {string} size - 'sm' | 'md' | 'lg' (default: 'md')
 * @param {string} color - Tailwind color class (default: 'bg-brand-blue')
 */
export const FrostSpinner = React.memo(function FrostSpinner({
  size = 'md',
  color = 'bg-brand-blue',
}) {
  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
  };

  const gapClasses = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2',
  };

  const dotClass = `${sizeClasses[size]} rounded-full ${color}`;

  // Reduced motion: show static dots
  if (prefersReducedMotion) {
    return (
      <div className={`flex ${gapClasses[size]}`} role="status" aria-label="Loading">
        <div className={`${dotClass} opacity-60`} />
        <div className={`${dotClass} opacity-80`} />
        <div className={`${dotClass} opacity-100`} />
      </div>
    );
  }

  return (
    <div className={`flex ${gapClasses[size]}`} role="status" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={dotClass}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
});

export default FrostSpinner;
