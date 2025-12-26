import { useRef, useCallback, useEffect, useState } from 'react';

// Priority-based stagger delays (defined outside hook to avoid recreating on every render)
const PRIORITY_DELAYS = {
  high: 0,
  medium: 50,
  low: 150,
};

/**
 * useDeferredFetch - Defers API fetches for off-screen charts to reduce cascade load
 *
 * When filters change, all charts on the page want to refetch. This creates a
 * "cascade" of 10+ simultaneous API calls, which:
 * - Overwhelms the server
 * - Causes slower response times for ALL charts
 * - Wastes bandwidth for charts the user may never see
 *
 * This hook solves this by:
 * 1. Using IntersectionObserver to detect if chart is visible
 * 2. Deferring fetch for non-visible charts until they become visible
 * 3. Adding optional stagger delays based on priority
 *
 * Usage:
 * ```jsx
 * const { shouldFetch, containerRef } = useDeferredFetch({
 *   filterKey: debouncedFilterKey,  // Trigger when this changes
 *   priority: 'high',               // 'high' | 'medium' | 'low'
 *   fetchOnMount: true,             // Fetch immediately on mount even if not visible
 * });
 *
 * useEffect(() => {
 *   if (!shouldFetch) return;
 *   // ... fetch data
 * }, [shouldFetch]);
 *
 * return <div ref={containerRef}>...</div>;
 * ```
 *
 * Priority delays (after becoming visible):
 * - high: 0ms (immediate)
 * - medium: 50ms
 * - low: 150ms
 *
 * @param {Object} options
 * @param {string} options.filterKey - The filter key that triggers refetch
 * @param {'high'|'medium'|'low'} options.priority - Chart priority level
 * @param {boolean} options.fetchOnMount - Whether to fetch on first mount
 * @returns {Object} { shouldFetch, containerRef, isVisible }
 */
export function useDeferredFetch({
  filterKey,
  priority = 'medium',
  fetchOnMount = true,
} = {}) {
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(fetchOnMount);
  const lastFilterKeyRef = useRef(filterKey);
  const isFirstMountRef = useRef(true);
  const deferTimeoutRef = useRef(null);

  // Set up IntersectionObserver for visibility detection
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        root: null, // viewport
        rootMargin: '100px', // Start loading slightly before visible
        threshold: 0,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Handle filter changes and visibility-based fetch deferral
  useEffect(() => {
    // On first mount, fetch immediately if fetchOnMount is true
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      if (fetchOnMount) {
        setShouldFetch(true);
        lastFilterKeyRef.current = filterKey;
      }
      return;
    }

    // If filterKey hasn't changed, don't do anything
    if (filterKey === lastFilterKeyRef.current) return;

    // Clear any pending deferred fetch
    if (deferTimeoutRef.current) {
      clearTimeout(deferTimeoutRef.current);
      deferTimeoutRef.current = null;
    }

    // If visible, fetch with priority-based delay
    if (isVisible) {
      const delay = PRIORITY_DELAYS[priority] || PRIORITY_DELAYS.medium;
      if (delay === 0) {
        setShouldFetch(true);
        lastFilterKeyRef.current = filterKey;
      } else {
        deferTimeoutRef.current = setTimeout(() => {
          setShouldFetch(true);
          lastFilterKeyRef.current = filterKey;
        }, delay);
      }
    } else {
      // Not visible - mark as needing fetch when visible
      setShouldFetch(false);
    }

    return () => {
      if (deferTimeoutRef.current) {
        clearTimeout(deferTimeoutRef.current);
      }
    };
  }, [filterKey, isVisible, priority, fetchOnMount]);

  // When chart becomes visible and has pending filter change, trigger fetch
  useEffect(() => {
    if (isVisible && filterKey !== lastFilterKeyRef.current) {
      const delay = PRIORITY_DELAYS[priority] || PRIORITY_DELAYS.medium;
      deferTimeoutRef.current = setTimeout(() => {
        setShouldFetch(true);
        lastFilterKeyRef.current = filterKey;
      }, delay);

      return () => {
        if (deferTimeoutRef.current) {
          clearTimeout(deferTimeoutRef.current);
        }
      };
    }
  }, [isVisible, filterKey, priority]);

  // Reset shouldFetch to false after it's been consumed (for next filter change)
  const markFetched = useCallback(() => {
    // This is called by the consuming component after it starts fetching
    // We don't actually need to reset shouldFetch since the filterKey check handles it
  }, []);

  return {
    shouldFetch,
    containerRef,
    isVisible,
    markFetched,
  };
}

export default useDeferredFetch;
