import React from 'react';
import { GLSDataTable } from '../components/powerbi/GLSDataTable';
import { UpcomingLaunchesTable } from '../components/powerbi/UpcomingLaunchesTable';
import { ErrorBoundary } from '../components/ui';
import { useChartHeight, MOBILE_CAPS } from '../hooks';

/**
 * Supply & Inventory Insights Page
 *
 * Displays supply-side market data:
 * - Government Land Sales (GLS) data
 * - Upcoming project launches
 */
export function SupplyInsightsContent() {
  const tableHeight = useChartHeight(400, MOBILE_CAPS.tall);

  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Supply & Inventory Insights
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Track government land sales and upcoming project launches
          </p>
        </div>

        {/* Content */}
        <div className="animate-view-enter space-y-4 md:space-y-6">
          {/* GLS Data Table */}
          <ErrorBoundary name="GLS Data Table" compact>
            <GLSDataTable height={tableHeight} />
          </ErrorBoundary>

          {/* Upcoming Launches Table */}
          <ErrorBoundary name="Upcoming Launches" compact>
            <UpcomingLaunchesTable height={tableHeight} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default SupplyInsightsContent;
