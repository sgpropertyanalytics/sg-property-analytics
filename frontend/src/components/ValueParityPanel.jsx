import React from 'react';
import DealCheckerContent from './powerbi/DealCheckerContent';

/**
 * ValueParityPanel - Value Check Tool
 *
 * Compare your purchase to nearby transactions and evaluate if it's a good deal.
 * This component now focuses solely on the Value Check functionality.
 *
 * Budget-based property search has been moved to the Explore page (/explore).
 */
export function ValueParityPanel() {
  return (
    <div className="space-y-6 animate-fade-in">
      <DealCheckerContent />
    </div>
  );
}

export default ValueParityPanel;
