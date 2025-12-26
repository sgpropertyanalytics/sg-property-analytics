/**
 * Debounced Filter Key Hook
 *
 * Delays effect triggers by 200ms when users click multiple filters in quick succession.
 * This prevents firing 8+ API calls per click during active filter adjustment.
 */

import { useState, useEffect, useRef } from 'react';

/**
 * Hook to create a debounced version of the filter key.
 *
 * @param {string} filterKey - The current filter key
 * @param {number} delay - Debounce delay in ms (default: 200)
 * @returns {string} Debounced filter key
 */
export function useDebouncedFilterKey(filterKey, delay = 200) {
  const [debouncedFilterKey, setDebouncedFilterKey] = useState(filterKey);
  const debounceTimeoutRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip debouncing on first render to ensure immediate initial load
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setDebouncedFilterKey(filterKey);
      return;
    }

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set debounced update after delay
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedFilterKey(filterKey);
    }, delay);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [filterKey, delay]);

  return debouncedFilterKey;
}
