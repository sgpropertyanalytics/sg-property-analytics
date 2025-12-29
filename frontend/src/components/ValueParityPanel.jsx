import React from 'react';
import DealCheckerContent from './powerbi/DealCheckerContent';

/**
 * ValueParityPanel - Deal Checker Tool
 *
 * Compare your purchase to nearby transactions and evaluate if it's a good deal.
 * This component now focuses solely on the Deal Checker functionality.
 *
 * Budget-based property search has been moved to the Explore page (/project-deep-dive).
 */
export function ValueParityPanel() {
  return (
    <div className="space-y-6 animate-fade-in">
      <DealCheckerContent />
    </div>
  );
}

export default ValueParityPanel;
