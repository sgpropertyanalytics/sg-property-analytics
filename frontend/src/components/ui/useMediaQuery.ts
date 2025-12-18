import { useState, useEffect, useCallback } from 'react';

/**
 * Tailwind-compatible breakpoints (desktop-first)
 * These match Tailwind's default breakpoints for consistency
 */
export const BREAKPOINTS = {
  sm: 640,   // Small devices (landscape phones)
  md: 768,   // Tablets (iPad portrait)
  lg: 1024,  // Small desktops / iPad landscape
  xl: 1280,  // Standard desktops
  '2xl': 1440, // Large desktops (primary target)
} as const;

/**
 * Target test widths per responsive-dod skill
 */
export const TEST_WIDTHS = {
  mobile: 375,    // iPhone SE (new), small Android
  tablet: 768,    // iPad portrait
  desktop: 1024,  // iPad landscape
  primary: 1440,  // MacBook 15" (primary target)
} as const;

type BreakpointKey = keyof typeof BREAKPOINTS;

/**
 * Hook to check if viewport matches a media query
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern API
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
    // Legacy API fallback
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }, [query]);

  return matches;
}

/**
 * Hook to check if viewport is at or above a breakpoint (mobile-first)
 * @param breakpoint - Tailwind breakpoint key
 */
export function useBreakpointUp(breakpoint: BreakpointKey): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[breakpoint]}px)`);
}

/**
 * Hook to check if viewport is below a breakpoint (desktop-first)
 * @param breakpoint - Tailwind breakpoint key
 */
export function useBreakpointDown(breakpoint: BreakpointKey): boolean {
  return useMediaQuery(`(max-width: ${BREAKPOINTS[breakpoint] - 1}px)`);
}

/**
 * Hook that returns the current breakpoint name
 * Desktop-first: returns the smallest breakpoint that matches
 */
export function useCurrentBreakpoint(): BreakpointKey | 'xs' {
  const isSm = useBreakpointUp('sm');
  const isMd = useBreakpointUp('md');
  const isLg = useBreakpointUp('lg');
  const isXl = useBreakpointUp('xl');
  const is2Xl = useBreakpointUp('2xl');

  if (is2Xl) return '2xl';
  if (isXl) return 'xl';
  if (isLg) return 'lg';
  if (isMd) return 'md';
  if (isSm) return 'sm';
  return 'xs';
}

/**
 * Hook that returns boolean flags for common device categories
 */
export function useDeviceType() {
  const isMobile = useBreakpointDown('md');  // < 768px
  const isTablet = useMediaQuery(`(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`);
  const isDesktop = useBreakpointUp('lg');   // >= 1024px

  return { isMobile, isTablet, isDesktop };
}

/**
 * Hook for window size (debounced)
 */
export function useWindowSize(debounceMs = 100) {
  const [size, setSize] = useState(() => {
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1440, height: 900 }; // Default to primary target
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setSize({ width: window.innerWidth, height: window.innerHeight });
      }, debounceMs);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [debounceMs]);

  return size;
}

/**
 * Hook that detects if the device supports touch
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  }, []);

  return isTouch;
}

/**
 * Utility function to generate responsive class names
 * Follows desktop-first approach: define desktop, override for smaller
 */
export function responsiveClasses(config: {
  base?: string;      // Always applied
  xs?: string;        // < 640px
  sm?: string;        // >= 640px
  md?: string;        // >= 768px
  lg?: string;        // >= 1024px
  xl?: string;        // >= 1280px
  '2xl'?: string;     // >= 1440px
}): string {
  const classes: string[] = [];

  if (config.base) classes.push(config.base);
  if (config.xs) classes.push(config.xs);
  if (config.sm) classes.push(config.sm.split(' ').map(c => `sm:${c}`).join(' '));
  if (config.md) classes.push(config.md.split(' ').map(c => `md:${c}`).join(' '));
  if (config.lg) classes.push(config.lg.split(' ').map(c => `lg:${c}`).join(' '));
  if (config.xl) classes.push(config.xl.split(' ').map(c => `xl:${c}`).join(' '));
  if (config['2xl']) classes.push(config['2xl'].split(' ').map(c => `2xl:${c}`).join(' '));

  return classes.join(' ');
}
