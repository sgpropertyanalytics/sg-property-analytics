import React from 'react';
import { usePowerBIFilters } from '../context/PowerBIFilterContext';

/**
 * Analytics View Page - Power BI Style Deep-Dive
 *
 * Future features:
 * - Advanced filtering with pinned sidebar
 * - Multi-dimensional analysis
 * - Custom chart configurations
 * - Export capabilities
 */
export function AnalyticsViewContent() {
  const { filters, activeFilterCount } = usePowerBIFilters();

  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Analytics View
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Power BI-style deep-dive analytics with advanced filtering
          </p>
          {activeFilterCount > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 bg-[#547792]/10 text-[#547792] px-3 py-1.5 rounded-lg text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active</span>
            </div>
          )}
        </div>

        {/* Placeholder Content */}
        <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-8 text-center">
          <div className="max-w-md mx-auto">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-[#547792]/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-[#213448] mb-2">
              Coming Soon
            </h2>
            <p className="text-[#547792] text-sm mb-6">
              Advanced analytics features with Power BI-style exploration. The filter sidebar
              is pinned open on this page for deep-dive analysis.
            </p>

            {/* Feature Preview */}
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 1
                </div>
                <div className="text-sm text-[#213448]">Custom Charts</div>
              </div>
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 2
                </div>
                <div className="text-sm text-[#213448]">Multi-Dimension</div>
              </div>
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 3
                </div>
                <div className="text-sm text-[#213448]">Data Export</div>
              </div>
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 4
                </div>
                <div className="text-sm text-[#213448]">Saved Views</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsViewContent;
