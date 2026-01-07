import React from 'react';

/**
 * TerminalShell (Clean Analyst Console Edition)
 * 
 * Functions as the structural container for page content.
 * - Removes the "Void" padding (fills the available space)
 * - Removes theatrical HUD elements (corner brackets, encoded status)
 * - Provides consistent max-width constraint for readability
 * 
 * The background is handled by the parent DashboardLayout (#F5F7FA).
 * This component just ensures content alignment.
 */
export const TerminalShell = React.memo(function TerminalShell({ children, className = '' }) {
  return (
    <div className={`w-full min-h-full flex flex-col relative ${className}`}>
      {/* Content Container - max-width constrained for readability on larger screens */}
      {/* Pushed to left or centered? "Clean Analyst" usually implies centered max-width or fluid. */}
      {/* Going with fluid but with a reasonable max-width to prevent stretching on ultrawides */}
      <div className="flex-1 w-full max-w-[1920px] mx-auto relative z-10">
        <div className="h-full flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
});

export default TerminalShell;
