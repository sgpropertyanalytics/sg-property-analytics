import React from 'react';

/**
 * Insights Page - Placeholder
 *
 * Future features:
 * - AI-generated market insights
 * - Trend predictions
 * - Investment recommendations
 * - Market alerts and notifications
 */
export function InsightsContent() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Insights
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            AI-powered market insights and trend analysis
          </p>
        </div>

        {/* Placeholder Content */}
        <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-8 text-center">
          <div className="max-w-md mx-auto">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-[#547792]/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-[#213448] mb-2">
              Coming Soon
            </h2>
            <p className="text-[#547792] text-sm mb-6">
              Market insights and predictive analytics powered by AI. Get personalized
              recommendations and stay ahead of market trends.
            </p>

            {/* Feature Preview */}
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 1
                </div>
                <div className="text-sm text-[#213448]">AI Insights</div>
              </div>
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 2
                </div>
                <div className="text-sm text-[#213448]">Predictions</div>
              </div>
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 3
                </div>
                <div className="text-sm text-[#213448]">Alerts</div>
              </div>
              <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                  Feature 4
                </div>
                <div className="text-sm text-[#213448]">Reports</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InsightsContent;
