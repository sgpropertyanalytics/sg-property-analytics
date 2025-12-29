import { useState, useCallback, lazy, Suspense } from 'react';
import { ChartWatermark } from '../components/ui';
import { MarketMomentumGrid, GrowthDumbbellChart } from '../components/powerbi';
import { SaleType } from '../schemas/apiContract';
import { ChartSkeleton } from '../components/common/ChartSkeleton';

// Lazy-load heavy map component (~450KB MapLibre + 98KB GeoJSON)
const MarketStrategyMap = lazy(() => import('../components/insights/MarketStrategyMap'));

/**
 * Value Check Page
 *
 * Price/PSF analysis across districts (migrated from District Deep Dive Price tab)
 *
 * Features:
 * - Market Strategy Map (IMPLEMENTED) - Median PSF by district
 * - Market Momentum Grid (IMPLEMENTED) - Median PSF by district
 * - Growth Dumbbell Chart (IMPLEMENTED) - PSF growth comparison
 *
 * NOTE: This page manages its own filter state (period, bed).
 * saleType is fixed to SaleType.RESALE (page-level enforcement).
 * This is ISOLATED from the PowerBIFilterContext sidebar (which only affects Market Core).
 */
export function ValueCheckContent() {
  // Shared filter state for all charts in this page
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
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Value Check
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Price and PSF analysis across districts
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6 animate-fade-in">
          {/* District Price Map - controls the shared filters, lazy-loaded */}
          <ChartWatermark>
            <Suspense fallback={<ChartSkeleton type="map" height={600} />}>
              <MarketStrategyMap
                selectedPeriod={selectedPeriod}
                selectedBed={selectedBed}
                selectedSaleType={SaleType.RESALE}
                onFilterChange={handleFilterChange}
              />
            </Suspense>
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
      </div>
    </div>
  );
}

export default ValueCheckContent;
