import React from 'react';
import { FilterBar as PowerBIFilterBar } from '../powerbi/FilterBar';

/**
 * FilterBar - Pattern wrapper around the PowerBI filter bar.
 *
 * @param {import('react').ComponentProps<typeof PowerBIFilterBar>} props
 */
export function FilterBar(props) {
  return <PowerBIFilterBar {...props} />;
}

export default FilterBar;
