import { useState, useEffect } from 'react';

/**
 * Desktop-first chart height hook with mobile guardrail
 *
 * Desktop (md+): Returns exact height as specified
 * Mobile (<768px): Caps height at maxMobile to prevent viewport domination
 *
 * @param {number} desktopHeight - The intended desktop height in pixels
 * @param {number} maxMobile - Maximum height on mobile (default: 300px)
 * @returns {number} - Final height in pixels
 *
 * @example
 * const height = useChartHeight(350); // 350px on desktop, max 300px on mobile
 * const height = useChartHeight(420, 320); // 420px desktop, max 320px mobile
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
 */
export const MOBILE_CAPS = {
  compact: 260,   // Trend lines, simple bars
  standard: 300,  // Most charts (default)
  tall: 320,      // Scatter plots, complex visualizations
};

export default useChartHeight;
