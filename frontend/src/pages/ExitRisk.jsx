import { lazy, Suspense } from 'react';
import { ChartWatermark } from '../components/ui';
import { SaleType } from '../schemas/apiContract';
import { ChartSkeleton } from '../components/common/ChartSkeleton';

// Lazy-load heavy map component (~450KB MapLibre + 98KB GeoJSON)
const DistrictLiquidityMap = lazy(() => import('../components/insights/DistrictLiquidityMap'));

/**
 * Exit Risk Page
 *
 * Volume and liquidity analysis across districts (migrated from District Deep Dive Volume tab)
 *
 * Features:
 * - District Liquidity Map (IMPLEMENTED) - Transaction velocity and liquidity tiers
 *
 * NOTE: saleType is fixed to SaleType.RESALE (page-level enforcement)
 */
export function ExitRiskContent() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Exit Risk
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Transaction volume and liquidity analysis across districts
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6 animate-fade-in">
          {/* District Liquidity Map - Lazy-loaded with map skeleton */}
          <ChartWatermark>
            <Suspense fallback={<ChartSkeleton type="map" height={600} />}>
              <DistrictLiquidityMap saleType={SaleType.RESALE} />
            </Suspense>
          </ChartWatermark>
        </div>
      </div>
    </div>
  );
}

export default ExitRiskContent;
