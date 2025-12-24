/**
 * District & Project Deep Dive Page
 *
 * A focused analysis page for drilling down into specific districts and projects.
 *
 * Planned Features:
 * - District comparison tools
 * - Project-level analytics
 * - Historical price trends by district
 * - Competitive landscape analysis
 */
export function DistrictDeepDiveContent() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            District & Project Deep Dive
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Detailed analysis of districts and individual projects
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="space-y-6">
          {/* Placeholder Content */}
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
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                  />
                </svg>
              </div>

              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[#213448] mb-1">
                  Deep Dive Analytics Coming Soon
                </h2>
                <p className="text-[#547792] text-sm mb-4">
                  Explore detailed insights into specific districts and projects
                  in the Singapore property market.
                </p>

                {/* Feature Preview Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm text-[#213448]">District Compare</div>
                  </div>
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm text-[#213448]">Project Analysis</div>
                  </div>
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm text-[#213448]">Price History</div>
                  </div>
                  <div className="bg-[#EAE0CF]/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
                      Coming
                    </div>
                    <div className="text-sm text-[#213448]">Competitive View</div>
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

export default DistrictDeepDiveContent;
