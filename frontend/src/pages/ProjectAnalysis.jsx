import React from 'react';
import { usePowerBIFilters } from '../context/PowerBIFilterContext';

/**
 * Project Analysis Page - Placeholder
 *
 * Future features:
 * - Individual project deep-dives
 * - Unit-level transaction history
 * - Price trend analysis by project
 * - Competitor comparison tools
 */
export function ProjectAnalysisContent() {
  const { filters } = usePowerBIFilters();

  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Project Analysis
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Deep-dive into individual project performance and unit-level analytics
          </p>
        </div>

        {/* Placeholder Content */}
        <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-8 text-center">
          <div className="max-w-md mx-auto">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-[#547792]/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-[#213448] mb-2">
              Coming Soon
            </h2>
            <p className="text-[#547792] text-sm mb-6">
              Project Analysis features are currently under development. This page will include
              project search, unit-level transaction history, and comparative analysis tools.
            </p>

            {/* Feature Preview */}
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 1
                </div>
                <div className="text-sm text-[#213448]">Project Search</div>
              </div>
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 2
                </div>
                <div className="text-sm text-[#213448]">Unit History</div>
              </div>
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 3
                </div>
                <div className="text-sm text-[#213448]">Price Trends</div>
              </div>
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 4
                </div>
                <div className="text-sm text-[#213448]">Comparisons</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectAnalysisContent;
