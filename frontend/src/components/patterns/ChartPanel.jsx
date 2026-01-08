import React from 'react';
import { ChartPanel as BaseChartPanel } from '../ui/ChartPanel';

/**
 * ChartPanel - Pattern wrapper for standard chart containers.
 *
 * @param {import('react').ComponentProps<typeof BaseChartPanel>} props
 */
export function ChartPanel(props) {
  return <BaseChartPanel {...props} />;
}

export default ChartPanel;
