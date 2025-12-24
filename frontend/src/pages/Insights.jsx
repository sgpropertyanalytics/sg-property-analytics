import { MarketStrategyMap } from '../components/insights';
import { ErrorBoundary, ChartWatermark } from '../components/ui';

/**
 * Insights Page - Visual Analytics for Singapore Property Market
 *
 * Features:
 * - "Command Center" strategy map with Data Flag markers
 * - Fixed viewport (no pan, zoom only) for dashboard-like experience
 * - PSF values visible at a glance on district markers
 * - Hover tooltips with transactions and YoY trends
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
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Insights
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Visual analytics and market intelligence for Singapore property
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="space-y-6">
          {/* Strategy Map with Data Flags - Full Width */}
          <div className="animate-view-enter">
            <ErrorBoundary name="District Price Map" compact>
              <ChartWatermark>
                <MarketStrategyMap />
              </ChartWatermark>
            </ErrorBoundary>
          </div>

          {/* Coming Soon Features */}
          <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6 md:p-8">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="w-12 h-12 rounded-full bg-[#547792]/10 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6 text-[#547792]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>

              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[#213448] mb-1">
                  More Analytics Coming Soon
                </h2>
                <p className="text-[#547792] text-sm mb-4">
                  We&apos;re building more visual analytics tools to help you
                  understand the Singapore property market.
                </p>

                {/* Feature Preview Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm text-[#213448]">Price Trends</div>
                  </div>
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm text-[#213448]">AI Insights</div>
                  </div>
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm text-[#213448]">
                      Market Alerts
                    </div>
                  </div>
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm text-[#213448]">Reports</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InsightsContent;
