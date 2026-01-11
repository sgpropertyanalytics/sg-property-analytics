import { useState, useEffect } from 'react';
import { CHART_MOBILE_CAP } from '../constants/chartLayout';

/**
 * Desktop-first chart height hook with mobile guardrail
 *
 * Desktop (md+): Returns exact height as specified
 * Mobile (<768px): Caps height at maxMobile to prevent viewport domination
 *
 * SINGLE SOURCE OF TRUTH: Use constants from ../constants/chartLayout.js
 * - CHART_HEIGHT.standard for desktop heights
 * - CHART_MOBILE_CAP.standard for mobile caps
 *
 * @param {number} desktopHeight - The intended desktop height in pixels
 * @param {number} maxMobile - Maximum height on mobile (default: 300px)
 * @returns {number} - Final height in pixels
 *
 * @example
 * import { CHART_HEIGHT, CHART_MOBILE_CAP } from '../constants/chartLayout';
 * const height = useChartHeight(CHART_HEIGHT.standard, CHART_MOBILE_CAP.standard);
 */
export function useChartHeight(desktopHeight, maxMobile = 300) {
  const [height, setHeight] = useState(() =>
    computeHeight(desktopHeight, maxMobile)
  );

  useEffect(() => {
    const handleResize = () => {
      setHeight(computeHeight(desktopHeight, maxMobile));
    };

    // Use matchMedia for efficient breakpoint detection
    const mdQuery = window.matchMedia('(min-width: 768px)');
    mdQuery.addEventListener('change', handleResize);

    return () => {
      mdQuery.removeEventListener('change', handleResize);
    };
  }, [desktopHeight, maxMobile]);

  return height;
}

/**
 * Compute height based on viewport
 * Desktop (≥768px): exact desktopHeight
 * Mobile (<768px): min(desktopHeight, maxMobile)
 */
function computeHeight(desktopHeight, maxMobile) {
  if (typeof window === 'undefined') return desktopHeight; // SSR fallback

  const isMobile = window.innerWidth < 768;
  return isMobile ? Math.min(desktopHeight, maxMobile) : desktopHeight;
}

/**
 * Mobile cap presets for common chart types
 * @deprecated Use CHART_MOBILE_CAP from '../constants/chartLayout' instead
 */
export const MOBILE_CAPS = {
  compact: 260,   // Trend lines, simple bars
  standard: CHART_MOBILE_CAP.standard,  // Re-exported from chartLayout.js
  tall: CHART_MOBILE_CAP.standard,      // Re-exported from chartLayout.js (unified)
  medium: CHART_MOBILE_CAP.standard,    // Alias for backward compat
};

export default useChartHeight;
