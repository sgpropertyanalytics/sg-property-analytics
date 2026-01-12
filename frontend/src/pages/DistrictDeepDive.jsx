import { useState, lazy, Suspense } from 'react';
import { ChartWatermark } from '../components/ui';
import { MarketMomentumGrid, GrowthDumbbellChart } from '../components/powerbi';
// Phase 3.4: Unified filter bar (same as Market Overview)
import { FilterBar } from '../components/patterns';
import { PageCanvas, ControlRibbon } from '../components/layout';
import { SaleType } from '../schemas/apiContract';
import { ChartSkeleton } from '../components/common/ChartSkeleton';

// Lazy-load heavy map components (~450KB MapLibre + 98KB GeoJSON)
// These use default exports, so we can import directly
const DistrictLiquidityMap = lazy(() => import('../components/insights/DistrictLiquidityMap'));
const MarketStrategyMap = lazy(() => import('../components/insights/MarketStrategyMap'));

/**
 * District Deep Dive Page
 *
 * Phase 3.4: Uses standardized FilterBar (same as Market Overview).
 * Filters are managed by Zustand store, not local state.
 *
 * Single map view with Volume/Price toggle.
 * Filters persist across mode switches (via Zustand session storage).
 *
 * Components:
 * - Volume mode: District Liquidity Map + Liquidity Ranking Table
 * - Price mode: Market Strategy Map + Market Momentum Grid + Growth Dumbbell Chart
 *
 * DATA SCOPE: Resale transactions ONLY
 * All components receive saleType="Resale" from page level.
 */
export function DistrictDeepDiveContent() {
  const [mapMode, setMapMode] = useState('volume'); // 'volume' | 'price'

  // Phase 3.4: Filter state is now managed by Zustand store (useZustandFilters)
  // Components consume filters directly from Zustand - no prop drilling needed
  // Filters persist across mode switches via page-namespaced sessionStorage

  return (
    <PageCanvas>
      {/* Filter Bar - Contained in sticky ribbon (same as Market Overview) */}
      {/* Y/Q/M toggle disabled - District Overview uses fixed aggregation */}
      <ControlRibbon>
        <FilterBar disabledFilters={{ timeGrouping: true }} />
      </ControlRibbon>

      {/* Main Content */}
      <div className="space-y-6 animate-fade-in">
          {/* Map - render active mode only to avoid background data fetches */}
          <ChartWatermark>
            <Suspense fallback={<ChartSkeleton type="map" height={600} />}>
              {mapMode === 'volume' ? (
                <DistrictLiquidityMap
                  saleType={SaleType.RESALE}
                  mapMode={mapMode}
                  onModeChange={setMapMode}
                  enabled={mapMode === 'volume'}
                />
              ) : (
                <MarketStrategyMap
                  selectedSaleType={SaleType.RESALE}
                  mapMode={mapMode}
                  onModeChange={setMapMode}
                  enabled={mapMode === 'price'}
                />
              )}
            </Suspense>
          </ChartWatermark>

          {/* Price mode: Show Market Momentum Grid and Growth Dumbbell Chart */}
          {mapMode === 'price' && (
            <>
              <ChartWatermark>
                <MarketMomentumGrid
                  saleType={SaleType.RESALE}
                />
              </ChartWatermark>

              <ChartWatermark>
                <GrowthDumbbellChart
                  saleType={SaleType.RESALE}
                  enabled={mapMode === 'price'}
                />
              </ChartWatermark>
            </>
          )}
        </div>
    </PageCanvas>
  );
}

export default DistrictDeepDiveContent;
