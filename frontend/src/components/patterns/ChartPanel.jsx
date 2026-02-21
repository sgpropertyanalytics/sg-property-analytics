import React from 'react';
import { ChartPanel as BaseChartPanel } from '../ui/ChartPanel';

/**
 * ChartPanel - Pattern wrapper for standard chart containers.
 *
 * @param {import('react').ComponentProps<typeof BaseChartPanel>} props
 */
export const ChartPanel = React.forwardRef(function ChartPanel(props, ref) {
  return <BaseChartPanel ref={ref} {...props} />;
});

export default ChartPanel;
