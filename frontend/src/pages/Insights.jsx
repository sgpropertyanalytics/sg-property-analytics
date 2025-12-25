/**
 * Project Deep Dive Page - Individual Project Analysis
 *
 * Coming Soon Features:
 * - Fundamentals & Pricing: Project details, PSF trends, price history
 * - Liquidity & Resale Success: Transaction velocity, profit/loss stats
 * - Floor-Level Optimization: Floor premium analysis
 */
export function InsightsContent() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Project Deep Dive
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Comprehensive analysis of individual projects
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6 animate-fade-in">
          {/* Coming Soon Card */}
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
                    d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
                  />
                </svg>
              </div>

              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[#213448] mb-1">
                  Project Deep Dive Analytics Coming Soon
                </h2>
                <p className="text-[#547792] text-sm mb-4">
                  Comprehensive analysis of individual projects including pricing, liquidity, and floor optimization.
                </p>

                {/* Feature Preview Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm font-medium text-[#213448]">Fundamentals & Pricing</div>
                    <p className="text-xs text-[#547792] mt-1">
                      Project details, PSF trends, and price history analysis
                    </p>
                  </div>
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm font-medium text-[#213448]">Liquidity & Resale Success</div>
                    <p className="text-xs text-[#547792] mt-1">
                      Transaction velocity and resale profit/loss statistics
                    </p>
                  </div>
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm font-medium text-[#213448]">Floor-Level Optimization</div>
                    <p className="text-xs text-[#547792] mt-1">
                      Floor premium analysis and optimal floor selection
                    </p>
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
