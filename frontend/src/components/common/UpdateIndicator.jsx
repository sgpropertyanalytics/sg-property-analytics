import React from 'react';
import { FrostSpinner } from './loading';

/**
 * UpdateIndicator - Compact loading indicator for filter updates
 *
 * Shows a small pill with pulsing dots animation to indicate data is being fetched.
 * Designed to overlay charts without obstructing too much content.
 *
 * Uses the design system colors:
 * - Navy background (#213448 with transparency)
 * - Blue dots (#547792)
 * - Sand text (#EAE0CF)
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
