import { useState, useCallback, lazy, Suspense } from 'react';
import { ChartWatermark } from '../components/ui';
import { MarketMomentumGrid, GrowthDumbbellChart } from '../components/powerbi';
import { SaleType } from '../schemas/apiContract';
import { ChartSkeleton } from '../components/common/ChartSkeleton';

// Lazy-load heavy map components (~450KB MapLibre + 98KB GeoJSON)
// These use default exports, so we can import directly
const DistrictLiquidityMap = lazy(() => import('../components/insights/DistrictLiquidityMap'));
const MarketStrategyMap = lazy(() => import('../components/insights/MarketStrategyMap'));

/**
 * District Deep Dive Page
 *
 * Single map view with Volume/Price toggle.
 * Filters persist across mode switches.
 *
 * Components:
 * - Volume mode: District Liquidity Map + Liquidity Ranking Table
 * - Price mode: Market Strategy Map + Market Momentum Grid + Growth Dumbbell Chart
 */
export function DistrictDeepDiveContent() {
  const [mapMode, setMapMode] = useState('volume'); // 'volume' | 'price'

  // Shared filter state - persists across mode switches
  // NOTE: saleType is fixed to SaleType.RESALE (page-level enforcement)
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [selectedBed, setSelectedBed] = useState('all');

  // Callback for filter changes from either map
  const handleFilterChange = useCallback((filterType, value) => {
    if (filterType === 'period') {
      setSelectedPeriod(value);
    } else if (filterType === 'bed') {
      setSelectedBed(value);
    }
  }, []);

  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            District Overview
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            District-level market analysis
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6 animate-fade-in">
          {/* Map - both rendered, CSS controls visibility to prevent unmount/remount */}
          <ChartWatermark>
            <Suspense fallback={<ChartSkeleton type="map" height={600} />}>
              {/* Volume Mode Map - hidden when in price mode */}
              <div style={{ display: mapMode === 'volume' ? 'block' : 'none' }}>
                <DistrictLiquidityMap
                  saleType={SaleType.RESALE}
                  selectedPeriod={selectedPeriod}
                  selectedBed={selectedBed}
                  onFilterChange={handleFilterChange}
                  mapMode={mapMode}
                  onModeChange={setMapMode}
                />
              </div>
              {/* Price Mode Map - hidden when in volume mode */}
              <div style={{ display: mapMode === 'price' ? 'block' : 'none' }}>
                <MarketStrategyMap
                  selectedPeriod={selectedPeriod}
                  selectedBed={selectedBed}
                  selectedSaleType={SaleType.RESALE}
                  onFilterChange={handleFilterChange}
                  mapMode={mapMode}
                  onModeChange={setMapMode}
                />
              </div>
            </Suspense>
          </ChartWatermark>

          {/* Price mode: Show Market Momentum Grid and Growth Dumbbell Chart */}
          {mapMode === 'price' && (
            <>
              <ChartWatermark>
                <MarketMomentumGrid
                  period={selectedPeriod}
                  bedroom={selectedBed}
                  saleType={SaleType.RESALE}
                />
              </ChartWatermark>

              <ChartWatermark>
                <GrowthDumbbellChart
                  bedroom={selectedBed}
                  saleType={SaleType.RESALE}
                  enabled={mapMode === 'price'}
                />
              </ChartWatermark>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DistrictDeepDiveContent;
