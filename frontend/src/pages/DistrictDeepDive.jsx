import { useState } from 'react';
import { DistrictLiquidityMap, MarketStrategyMap } from '../components/insights';
import { ChartWatermark } from '../components/ui';
import { MarketMomentumGrid, GrowthDumbbellChart } from '../components/powerbi';

/**
 * District Deep Dive Page
 *
 * Two tabs:
 * 1. District (Volume/Liquidity) - Volume and liquidity analysis across districts
 *    - Liquidity Map (IMPLEMENTED)
 *    - Market Momentum Grid (IMPLEMENTED)
 *    - Growth Dumbbell Chart (IMPLEMENTED)
 *
 * 2. District (Price/PSF) - Price and PSF analysis across districts
 *    - Market Strategy Map (IMPLEMENTED)
 */
export function DistrictDeepDiveContent() {
  const [activeTab, setActiveTab] = useState('volume'); // 'volume' | 'price'

  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            District Deep Dive
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Comprehensive district-level market analysis
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6 animate-fade-in">
          {/* Tab Navigation - Segmented Toggle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* District (Volume/Liquidity) Tab */}
            <button
              onClick={() => setActiveTab('volume')}
              className={`relative p-6 rounded-xl border text-left transition-all duration-200 ease-in-out flex items-start gap-4 group ${
                activeTab === 'volume'
                  ? 'bg-[#213448] border-[#213448] shadow-lg'
                  : 'bg-white border-[#94B4C1]/50 hover:border-[#547792] hover:bg-[#EAE0CF]/10'
              }`}
            >
              <div className={`p-3 rounded-lg ${activeTab === 'volume' ? 'bg-white/10' : 'bg-[#EAE0CF]/30'}`}>
                <svg className={`w-6 h-6 ${activeTab === 'volume' ? 'text-[#EAE0CF]' : 'text-[#547792]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h3 className={`font-bold text-lg mb-1 ${activeTab === 'volume' ? 'text-white' : 'text-[#213448]'}`}>
                  District (Volume/Liquidity)
                </h3>
                <p className={`text-sm ${activeTab === 'volume' ? 'text-[#94B4C1]' : 'text-[#547792]'}`}>
                  Compare transaction volume and liquidity across districts
                </p>
              </div>
            </button>

            {/* District (Price/PSF) Tab */}
            <button
              onClick={() => setActiveTab('price')}
              className={`relative p-6 rounded-xl border text-left transition-all duration-200 ease-in-out flex items-start gap-4 group ${
                activeTab === 'price'
                  ? 'bg-[#213448] border-[#213448] shadow-lg'
                  : 'bg-white border-[#94B4C1]/50 hover:border-[#547792] hover:bg-[#EAE0CF]/10'
              }`}
            >
              <div className={`p-3 rounded-lg ${activeTab === 'price' ? 'bg-white/10' : 'bg-[#EAE0CF]/30'}`}>
                <svg className={`w-6 h-6 ${activeTab === 'price' ? 'text-[#EAE0CF]' : 'text-[#547792]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className={`font-bold text-lg mb-1 ${activeTab === 'price' ? 'text-white' : 'text-[#213448]'}`}>
                  District (Price/PSF)
                </h3>
                <p className={`text-sm ${activeTab === 'price' ? 'text-[#94B4C1]' : 'text-[#547792]'}`}>
                  Analyze price trends and PSF across districts
                </p>
              </div>
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'volume' ? (
            <DistrictVolumeContent />
          ) : (
            <DistrictPriceContent />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * District (Volume/Liquidity) Tab Content
 * Features: Liquidity Map, Market Momentum Grid, Growth Dumbbell Chart
 */
function DistrictVolumeContent() {
  return (
    <div className="space-y-6">
      {/* District Liquidity Map */}
      <ChartWatermark>
        <DistrictLiquidityMap />
      </ChartWatermark>

      {/* Market Momentum Grid - Historical price growth by district */}
      <ChartWatermark>
        <MarketMomentumGrid />
      </ChartWatermark>

      {/* Growth Leaderboard - Dumbbell chart comparing start vs end price */}
      <ChartWatermark>
        <GrowthDumbbellChart />
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
 * District (Price/PSF) Tab Content
 * Features: Market Strategy Map showing district PSF overview
 */
function DistrictPriceContent() {
  return (
    <div className="space-y-6">
      {/* District Price Map */}
      <ChartWatermark>
        <MarketStrategyMap />
      </ChartWatermark>
    </div>
  );
}

export default DistrictDeepDiveContent;
