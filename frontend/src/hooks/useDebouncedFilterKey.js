import { useState, useEffect, useRef } from 'react';

/**
 * useDebouncedFilterKey - Debounces filter key changes to prevent rapid API calls
 *
 * When users click multiple filters in quick succession, this hook delays the
 * effect trigger until filter changes settle. This prevents firing 8+ API calls
 * per click when users are actively adjusting filters.
 *
 * @param {string} filterKey - The stable filter key from PowerBIFilterContext
 * @param {number} delay - Debounce delay in milliseconds (default: 200ms)
 * @returns {string} - The debounced filter key (updates after delay)
 *
 * Usage in charts:
 * ```jsx
 * const { filterKey } = usePowerBIFilters();
 * const debouncedFilterKey = useDebouncedFilterKey(filterKey, 200);
 *
 * useEffect(() => {
 *   // Fetch data - only fires after filters settle
 *   fetchData();
 * }, [debouncedFilterKey]);
 * ```
 */
export function useDebouncedFilterKey(filterKey, delay = 200) {
  const [debouncedKey, setDebouncedKey] = useState(filterKey);
  const timeoutRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip debouncing on first render to ensure immediate initial load
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setDebouncedKey(filterKey);
      return;
    }

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced update
    timeoutRef.current = setTimeout(() => {
      setDebouncedKey(filterKey);
    }, delay);

    // Cleanup on unmount or when filterKey/delay changes
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [filterKey, delay]);

  return debouncedKey;
}

export default useDebouncedFilterKey;
