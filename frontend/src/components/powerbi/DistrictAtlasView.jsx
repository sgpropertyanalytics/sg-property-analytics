import React, { useState, lazy, Suspense } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { SupplyDataProvider } from '../../context/SupplyDataContext';
import { ErrorBoundary } from '../ui';
import { MapMetricToggle } from './MapMetricToggle';
import { DistrictLeaderboard } from './DistrictLeaderboard';

// Lazy-loaded map component (heavy MapLibre GL dependency)
const MarketStrategyMap = lazy(() => import('../insights/MarketStrategyMap'));

// Lazy-loaded table components
const SupplyBreakdownTable = lazy(() =>
  import('./SupplyBreakdownTable').then(m => ({ default: m.SupplyBreakdownTable }))
);
const HotProjectsTable = lazy(() =>
  import('./HotProjectsTable').then(m => ({ default: m.HotProjectsTable }))
);

// Loading fallback
const LoadingFallback = ({ height = 400 }) => (
  <div
    className="bg-white rounded-lg border border-gray-200 animate-pulse flex items-center justify-center"
    style={{ height }}
  >
    <div className="text-gray-400 text-sm">Loading...</div>
  </div>
);

/**
 * DistrictAtlasView - Map-centric spatial analysis view
 *
 * Features:
 * - Interactive district map with metric-based coloring
 * - Floating metric toggle (Price / Volume / Supply)
 * - District leaderboard table (updates based on metric)
 * - Bottom tabbed section (Supply Breakdown / Projects)
 *
 * Data Flow:
 * - Receives filters from PowerBIFilterContext (sidebar filters apply)
 * - mapMetric state controls map coloring and leaderboard content
 * - bottomTab state controls which table is shown
 */
export function DistrictAtlasView({ saleType }) {
  const { filters } = usePowerBIFilters();

  // Map metric state: controls map coloring and leaderboard
  const [mapMetric, setMapMetric] = useState('price');

  // Bottom tab state: controls which table is shown
  const [bottomTab, setBottomTab] = useState('supply');

  // Build filter props for child components
  const filterProps = {
    dateRange: filters.dateRange,
    bedroomTypes: filters.bedroomTypes,
    saleType,
  };

  return (
    <SupplyDataProvider>
      <div className="space-y-4 md:space-y-6">
        {/* Map Section with Floating Metric Toggle */}
        <div className="relative">
          {/* Floating Metric Toggle - positioned over map */}
          <div className="absolute top-4 right-4 z-30">
            <MapMetricToggle metric={mapMetric} onMetricChange={setMapMetric} />
          </div>

          {/* Map Component */}
          <ErrorBoundary name="District Map" compact>
            <Suspense fallback={<LoadingFallback height={500} />}>
              <MarketStrategyMap
                dateRange={filterProps.dateRange}
                bedroomTypes={filterProps.bedroomTypes}
                saleType={filterProps.saleType}
                metricMode={mapMetric}
              />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* District Leaderboard - Updates based on selected metric */}
        <ErrorBoundary name="District Leaderboard" compact>
          <DistrictLeaderboard
            metric={mapMetric}
            saleType={saleType}
          />
        </ErrorBoundary>

        {/* Bottom Tabs Section */}
        <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-[#94B4C1]/30">
            <button
              type="button"
              onClick={() => setBottomTab('supply')}
              className={`
                flex-1 px-4 py-3 text-sm font-medium transition-colors
                ${bottomTab === 'supply'
                  ? 'bg-[#213448] text-white'
                  : 'text-[#547792] hover:bg-[#94B4C1]/10'
                }
              `}
            >
              Supply Breakdown
            </button>
            <button
              type="button"
              onClick={() => setBottomTab('projects')}
              className={`
                flex-1 px-4 py-3 text-sm font-medium transition-colors
                ${bottomTab === 'projects'
                  ? 'bg-[#213448] text-white'
                  : 'text-[#547792] hover:bg-[#94B4C1]/10'
                }
              `}
            >
              Active Projects
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4">
            <ErrorBoundary name={bottomTab === 'supply' ? 'Supply Breakdown' : 'Active Projects'} compact>
              <Suspense fallback={<LoadingFallback height={300} />}>
                {bottomTab === 'supply' && (
                  <SupplyBreakdownTable
                    selectedRegion={filters.segment}
                  />
                )}
                {bottomTab === 'projects' && (
                  <HotProjectsTable
                    height={400}
                    filters={{
                      region: filters.segment,
                      district: filters.districts?.[0],
                      bedroom: filters.bedroomTypes?.join(','),
                    }}
                    compact
                    showHeader={false}
                  />
                )}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </SupplyDataProvider>
  );
}

export default DistrictAtlasView;
