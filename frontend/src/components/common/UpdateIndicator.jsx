import React from 'react';
import { FrostSpinner } from './loading';

/**
 * UpdateIndicator - Compact loading indicator for filter updates
 *
 * Shows a small pill with pulsing dots animation to indicate data is being fetched.
 * Designed to overlay charts without obstructing too much content.
 *
 * Uses the Institutional Print / Slate palette:
 * - Primary background: slate-900 (#0F172A with transparency)
 * - Secondary: slate-700 (#334155)
 * - Light text: slate-200 (#E5E7EB)
 *
 * @deprecated Prefer using FrostOverlay component instead for loading states.
 * This component is kept for backward compatibility.
 */
export const UpdateIndicator = React.memo(function UpdateIndicator() {
  return (
    <div className="update-indicator">
      <FrostSpinner size="sm" />
      <span className="text-sm font-medium text-brand-sand">Updating...</span>
    </div>
  );
});

export default UpdateIndicator;
