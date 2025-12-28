import { useState, useCallback } from 'react';
import { DistrictLiquidityMap, MarketStrategyMap } from '../components/insights';
import { ChartWatermark } from '../components/ui';
import { MarketMomentumGrid, GrowthDumbbellChart } from '../components/powerbi';
import { SaleType } from '../schemas/apiContract';

/**
 * District Deep Dive Page
 *
 * Two tabs:
 * 1. District (Volume/Liquidity) - Volume and liquidity analysis across districts
 *    - Liquidity Map (IMPLEMENTED)
 *
 * 2. District (Price/PSF) - Price and PSF analysis across districts
 *    - Market Strategy Map (IMPLEMENTED)
 *    - Market Momentum Grid (IMPLEMENTED) - Median PSF by district
 *    - Growth Dumbbell Chart (IMPLEMENTED) - PSF growth comparison
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
 * Features: Liquidity Map
 *
 * NOTE: saleType is fixed to SaleType.RESALE (page-level enforcement)
 */
function DistrictVolumeContent() {
  return (
    <div className="space-y-6">
      {/* District Liquidity Map */}
      <ChartWatermark>
        <DistrictLiquidityMap saleType={SaleType.RESALE} />
      </ChartWatermark>
    </div>
  );
}

/**
 * District (Price/PSF) Tab Content
 * Features: Market Strategy Map, Market Momentum Grid, Growth Dumbbell Chart
 *
 * IMPORTANT: This tab manages its own filter state (period, bed, saleType).
 * These filters are shared across all three charts in this tab.
 * This is ISOLATED from the PowerBIFilterContext sidebar (which only affects Market Pulse).
 */
function DistrictPriceContent() {
  // Shared filter state for all charts in this tab
  // NOTE: saleType is fixed to SaleType.RESALE (page-level enforcement, no UI toggle)
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [selectedBed, setSelectedBed] = useState('all');

  // Callback for filter changes from MarketStrategyMap
  const handleFilterChange = useCallback((filterType, value) => {
    switch (filterType) {
      case 'period':
        setSelectedPeriod(value);
        break;
      case 'bed':
        setSelectedBed(value);
        break;
      default:
        break;
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* District Price Map - controls the shared filters */}
      <ChartWatermark>
        <MarketStrategyMap
          selectedPeriod={selectedPeriod}
          selectedBed={selectedBed}
          selectedSaleType={SaleType.RESALE}
          onFilterChange={handleFilterChange}
        />
      </ChartWatermark>

      {/* Market Momentum Grid - uses shared filters (no PowerBIFilterContext) */}
      <ChartWatermark>
        <MarketMomentumGrid
          period={selectedPeriod}
          bedroom={selectedBed}
          saleType={SaleType.RESALE}
        />
      </ChartWatermark>

      {/* Growth Dumbbell Chart - NOT affected by date filters (uses fixed date range) */}
      <ChartWatermark>
        <GrowthDumbbellChart
          bedroom={selectedBed}
          saleType={SaleType.RESALE}
        />
      </ChartWatermark>
    </div>
  );
}

export default DistrictDeepDiveContent;
