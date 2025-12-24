import { useState } from 'react';
import { DistrictLiquidityMap } from '../components/insights';
import { ChartWatermark } from '../components/ui';

/**
 * District & Project Deep Dive Page
 *
 * Two tabs:
 * 1. District Overview - Market-level analysis across districts
 *    - Liquidity Map (IMPLEMENTED)
 *    - New Launch vs Resale (Coming Soon)
 *    - Project Quality Distribution (Coming Soon)
 *
 * 2. Project Deep Dive - Individual project analysis
 *    - Fundamentals & Pricing
 *    - Liquidity & Resale Success
 *    - Floor-Level Optimization
 */
export function DistrictDeepDiveContent() {
  const [activeTab, setActiveTab] = useState('district'); // 'district' | 'project'

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

        {/* Main Content */}
        <div className="space-y-6 animate-fade-in">
          {/* Tab Navigation - Segmented Toggle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* District Overview Tab */}
            <button
              onClick={() => setActiveTab('district')}
              className={`relative p-6 rounded-xl border text-left transition-all duration-200 ease-in-out flex items-start gap-4 group ${
                activeTab === 'district'
                  ? 'bg-[#213448] border-[#213448] shadow-lg'
                  : 'bg-white border-[#94B4C1]/50 hover:border-[#547792] hover:bg-[#EAE0CF]/10'
              }`}
            >
              <div className={`p-3 rounded-lg ${activeTab === 'district' ? 'bg-white/10' : 'bg-[#EAE0CF]/30'}`}>
                <svg className={`w-6 h-6 ${activeTab === 'district' ? 'text-[#EAE0CF]' : 'text-[#547792]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <div>
                <h3 className={`font-bold text-lg mb-1 ${activeTab === 'district' ? 'text-white' : 'text-[#213448]'}`}>
                  District Overview
                </h3>
                <p className={`text-sm ${activeTab === 'district' ? 'text-[#94B4C1]' : 'text-[#547792]'}`}>
                  Compare performance across districts
                </p>
              </div>
            </button>

            {/* Project Deep Dive Tab */}
            <button
              onClick={() => setActiveTab('project')}
              className={`relative p-6 rounded-xl border text-left transition-all duration-200 ease-in-out flex items-start gap-4 group ${
                activeTab === 'project'
                  ? 'bg-[#213448] border-[#213448] shadow-lg'
                  : 'bg-white border-[#94B4C1]/50 hover:border-[#547792] hover:bg-[#EAE0CF]/10'
              }`}
            >
              <div className={`p-3 rounded-lg ${activeTab === 'project' ? 'bg-white/10' : 'bg-[#EAE0CF]/30'}`}>
                <svg className={`w-6 h-6 ${activeTab === 'project' ? 'text-[#EAE0CF]' : 'text-[#547792]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h3 className={`font-bold text-lg mb-1 ${activeTab === 'project' ? 'text-white' : 'text-[#213448]'}`}>
                  Project Deep Dive
                </h3>
                <p className={`text-sm ${activeTab === 'project' ? 'text-[#94B4C1]' : 'text-[#547792]'}`}>
                  Analyze a specific project in detail
                </p>
              </div>
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'district' ? (
            <DistrictOverviewContent />
          ) : (
            <ProjectDeepDiveContent />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * District Overview Tab Content
 * Features: Liquidity Map, New Launch vs Resale, Project Quality Distribution
 */
function DistrictOverviewContent() {
  return (
    <div className="space-y-6">
      {/* District Liquidity Map */}
      <ChartWatermark>
        <DistrictLiquidityMap />
      </ChartWatermark>

      {/* Coming Soon Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#EAE0CF]/50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-[#213448]">New Launch vs Resale</h3>
                <span className="text-[9px] px-1.5 py-0.5 bg-[#EAE0CF] text-[#547792] rounded-full font-medium">Coming</span>
              </div>
              <p className="text-xs text-[#547792]">
                Compare pricing and volume dynamics between new launches and resale market
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#EAE0CF]/50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-[#213448]">Project Quality Distribution</h3>
                <span className="text-[9px] px-1.5 py-0.5 bg-[#EAE0CF] text-[#547792] rounded-full font-medium">Coming</span>
              </div>
              <p className="text-xs text-[#547792]">
                Distribution of project tiers and quality ratings across districts
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Project Deep Dive Tab Content
 * Features: Fundamentals & Pricing, Liquidity & Resale Success, Floor-Level Optimization
 */
function ProjectDeepDiveContent() {
  return (
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
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
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
  );
}

export default DistrictDeepDiveContent;
