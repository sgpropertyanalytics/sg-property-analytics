import { createContext, useContext, useState, useCallback } from 'react';

const FilterContext = createContext(null);

export function FilterProvider({ children }) {
  const [filters, setFilters] = useState({
    bedrooms: ['2b', '3b', '4b'], // Default to 2BR, 3BR, 4BR
    segment: 'All Segments',
    district: 'All Districts',
  });

  const toggleBedroom = useCallback((bedroom) => {
    setFilters((prev) => {
      const bedrooms = [...prev.bedrooms];
      const index = bedrooms.indexOf(bedroom);
      
      if (index > -1) {
        // Remove if already selected, but ensure at least one remains
        if (bedrooms.length > 1) {
          bedrooms.splice(index, 1);
        }
      } else {
        // Add if not selected
        bedrooms.push(bedroom);
      }
      
      return { ...prev, bedrooms };
    });
  }, []);

  const setSegment = useCallback((segment) => {
    setFilters((prev) => ({ ...prev, segment }));
  }, []);

  const setDistrict = useCallback((district) => {
    setFilters((prev) => ({ ...prev, district }));
  }, []);

  return (
    <FilterContext.Provider value={{ filters, toggleBedroom, setSegment, setDistrict }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used within FilterProvider');
  }
  return context;
}

