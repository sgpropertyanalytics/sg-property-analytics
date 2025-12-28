import React from 'react';
import { NewVsResaleChart } from '../components/powerbi/NewVsResaleChart';
import { ErrorBoundary, ChartWatermark } from '../components/ui';
import { useChartHeight, MOBILE_CAPS } from '../hooks';
import { PageHeader } from '../components/ui';

/**
 * Primary Market Page - New Sale vs Resale Comparison
 *
 * This page is dedicated to comparing New Sale and Resale market segments.
 * Unlike Market Core (which is Resale-only), this page shows both sale types.
 *
 * No filter sidebar - the chart fetches its own data independently.
 */
export function PrimaryMarketContent() {
  // Desktop-first chart height with mobile guardrail
  const chartHeight = useChartHeight(400, MOBILE_CAPS.tall);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <PageHeader
          title="Primary Market Analysis"
          subtitle="Compare New Sale vs Recently TOP transactions across the market"
        />

        {/* Chart Grid */}
        <div className="animate-view-enter mt-4 md:mt-6">
          {/* New Sale vs Recently TOP Chart - Full width */}
          <ErrorBoundary name="New vs Resale Chart" compact>
            <ChartWatermark>
              <NewVsResaleChart height={chartHeight} />
            </ChartWatermark>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

/**
 * Standalone PrimaryMarket (for direct usage without DashboardLayout)
 */
export default function PrimaryMarket() {
  return <PrimaryMarketContent />;
}
