/**
 * Filter Options Hook
 *
 * Loads and manages available filter values from API.
 */

import { useState, useEffect } from 'react';
import { getFilterOptions } from '../../api/client';
import { normalizeFilterOptions } from '../../schemas/apiContract';
import { INITIAL_FILTER_OPTIONS } from './constants';

/**
 * Hook to load filter options from API.
 *
 * @returns {[Object, Function]} [filterOptions, setFilterOptions]
 */
export function useFilterOptions() {
  const [filterOptions, setFilterOptions] = useState(INITIAL_FILTER_OPTIONS);

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const response = await getFilterOptions();
        const data = response.data;

        // Normalize API response to {value, label} format
        const normalized = normalizeFilterOptions(data);

        setFilterOptions({
          // v2 normalized format
          districts: normalized.districts,
          regions: normalized.regions,
          bedrooms: normalized.bedrooms,
          saleTypes: normalized.saleTypes,
          tenures: normalized.tenures,
          marketSegments: normalized.marketSegments,
          propertyAgeBuckets: normalized.propertyAgeBuckets || [],
          // Ranges
          dateRange: normalized.dateRange,
          psfRange: normalized.psfRange,
          sizeRange: normalized.sizeRange,
          // Legacy compatibility
          districtsRaw: normalized.districtsRaw,
          regionsLegacy: normalized.regionsLegacy,
          // State
          loading: false,
          error: null,
        });
      } catch (err) {
        console.error('Error loading filter options:', err);
        setFilterOptions((prev) => ({
          ...prev,
          loading: false,
          error: err.message,
        }));
      }
    };
    loadFilterOptions();
  }, []);

  return [filterOptions, setFilterOptions];
}
