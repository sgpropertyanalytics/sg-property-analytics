import React, { useState, useEffect } from 'react';
import { PowerBIFilterProvider, usePowerBIFilters } from '../context/PowerBIFilterContext';
import { TimeTrendChart } from '../components/powerbi/TimeTrendChart';
import { PriceDistributionChart } from '../components/powerbi/PriceDistributionChart';
import { BeadsChart } from '../components/powerbi/BeadsChart';
import { NewVsResaleChart } from '../components/powerbi/NewVsResaleChart';
import { PriceCompressionChart } from '../components/powerbi/PriceCompressionChart';
import { AbsolutePsfChart } from '../components/powerbi/AbsolutePsfChart';
import { TransactionDetailModal } from '../components/powerbi/TransactionDetailModal';
import { DrillBreadcrumb } from '../components/powerbi/DrillBreadcrumb';
import { TimeGranularityToggle } from '../components/powerbi/TimeGranularityToggle';
import { ProjectDetailPanel } from '../components/powerbi/ProjectDetailPanel';
import { getKpiSummaryV2 } from '../api/client';
import { useData } from '../context/DataContext';
// Standardized responsive UI components (layout wrappers only)
import { ErrorBoundary, ChartWatermark, KPICardV2, KPICardV2Group } from '../components/ui';
// Desktop-first chart height with mobile guardrail
import { useChartHeight, MOBILE_CAPS } from '../hooks';

/**
 * Macro Overview Page - Power BI-style Dashboard (Market Pulse)
 *
 * Features:
 * - Dynamic filtering with sidebar controls
 * - Cross-filtering (click chart to filter others)
 * - Drill-down hierarchies:
 *   - Time: year -> quarter -> month
 *   - Location: region -> district (global hierarchy stops here)
 * - Project drill-through: Opens ProjectDetailPanel without affecting global charts
 * - Drill-through to transaction details
 *
 * NOTE: This component is designed to be wrapped by DashboardLayout which provides:
 * - PowerBIFilterProvider context
 * - PowerBIFilterSidebar (secondary sidebar)
 * - GlobalNavRail (primary navigation)
 * - Mobile responsive header and drawers
 */
export function MacroOverviewContent() {
  const { apiMetadata } = useData();
  const { filters } = usePowerBIFilters();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalFilters, setModalFilters] = useState({});

  // Desktop-first chart heights with mobile guardrails
  // Desktop: exact pixels | Mobile (<768px): capped to prevent viewport domination
  const trendChartHeight = useChartHeight(280, MOBILE_CAPS.compact);      // 280px desktop, max 260px mobile
  const standardChartHeight = useChartHeight(350, MOBILE_CAPS.standard);  // 350px desktop, max 300px mobile
  const compressionHeight = useChartHeight(380, MOBILE_CAPS.tall);        // 380px desktop, max 320px mobile

  // Summary KPIs - Deal detection metrics with trend indicators
  // Uses v2 standardized API format
  // Reacts to: Location filters (district, bedroom, segment)
  // Ignores: Date range filters (always shows "current market" status)
  const [kpis, setKpis] = useState({ items: [], loading: true });

  // Fetch KPIs using v2 standardized API
  useEffect(() => {
    const controller = new AbortController();

    const fetchKpis = async () => {
      try {
        setKpis(prev => ({ ...prev, loading: true }));

        // Build location/property filters (react to sidebar, but NOT date range)
        const params = {};
        if (filters.districts?.length > 0) {
          params.district = filters.districts.join(',');
        }
        if (filters.bedroomTypes?.length > 0) {
          params.bedroom = filters.bedroomTypes.join(',');
        }
        if (filters.segment) {
          params.segment = filters.segment;
        }

        // Single API call for all KPI metrics (v2 format)
        const response = await getKpiSummaryV2(params, { signal: controller.signal });

        setKpis({
          items: response.data.kpis || [],
          loading: false,
        });
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'CanceledError') return;
        console.error('Error fetching KPIs:', err);
        setKpis(prev => ({ ...prev, loading: false }));
      }
    };

    fetchKpis();
    return () => controller.abort();
  }, [filters.districts, filters.bedroomTypes, filters.segment]); // Re-fetch when location filters change

  // Helper to get KPI by ID from the array
  const getKpi = (kpiId) => kpis.items.find(k => k.kpi_id === kpiId);

  const handleDrillThrough = (title, additionalFilters = {}) => {
    setModalTitle(title);
    setModalFilters(additionalFilters);
    setModalOpen(true);
  };

  return (
    <div className="h-full">
      {/* Main Content Area - Scrollable */}
      <div className="h-full overflow-auto">
        <div className="p-3 md:p-4 lg:p-6">
          {/* Header */}
          <div className="mb-4 md:mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 mb-2">
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448] hidden lg:block">
                  Singapore Property Market Analytics
                </h1>
                {/* Data source info - shows raw database count and date range */}
                {apiMetadata && (
                  <p className="text-[#547792] text-xs md:text-sm italic truncate">
                    Data source from URA (Total of {((apiMetadata.row_count || 0) + (apiMetadata.total_records_removed || apiMetadata.outliers_excluded || 0)).toLocaleString()} transaction records
                    <span className="hidden md:inline">
                    {apiMetadata.min_date && apiMetadata.max_date && (
                      <> found from {new Date(apiMetadata.min_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short'
                      })} to {new Date(apiMetadata.max_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short'
                      })}</>
                    )})
                    {(apiMetadata.total_records_removed || apiMetadata.outliers_excluded) > 0 && (
                      <> | {(apiMetadata.total_records_removed || apiMetadata.outliers_excluded)?.toLocaleString()} outlier records excluded</>
                    )}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {/* Time Grouping Toggle - View context control (not a filter) */}
                <TimeGranularityToggle />
              </div>
            </div>

            {/* Breadcrumb navigation */}
            <DrillBreadcrumb />
          </div>

          {/* Analytics View - Dashboard with charts */}
          <div className="animate-view-enter">
              {/* KPI Summary Cards - Using standardized KPICardV2 */}
              <KPICardV2Group columns={4} className="mb-4 md:mb-6">
                {/* Card 1: Market Median PSF */}
                <KPICardV2
                  title="Market Median PSF"
                  value={getKpi('median_psf')?.formatted_value || '—'}
                  trend={getKpi('median_psf')?.trend}
                  transition={getKpi('median_psf')?.insight}
                  footerMeta={getKpi('median_psf')?.meta?.current_count ? `${getKpi('median_psf').meta.current_count.toLocaleString()} txns` : undefined}
                  loading={kpis.loading}
                />

                {/* Card 2: Price Spread (IQR) */}
                <KPICardV2
                  title="Price Spread (IQR)"
                  value={getKpi('price_spread')?.formatted_value || '—'}
                  trend={getKpi('price_spread')?.trend}
                  transition={getKpi('price_spread')?.insight}
                  loading={kpis.loading}
                />

                {/* Card 3: New Launch Premium */}
                <KPICardV2
                  title="New Launch Premium"
                  value={getKpi('new_launch_premium')?.formatted_value || '—'}
                  transition={getKpi('new_launch_premium')?.insight}
                  loading={kpis.loading}
                />

                {/* Card 4: Market Momentum */}
                <KPICardV2
                  title="Market Momentum"
                  value={getKpi('market_momentum')?.formatted_value || '—'}
                  trend={getKpi('market_momentum')?.trend}
                  transition={getKpi('market_momentum')?.insight}
                  loading={kpis.loading}
                />
              </KPICardV2Group>

              {/* Charts Grid - Responsive: 1 col mobile, 2 cols desktop */}
              {/* Each chart wrapped with ErrorBoundary to prevent cascade failures */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
                {/* Time Trend Chart - Full width on all screens */}
                <div className="lg:col-span-2">
                  <ErrorBoundary name="Time Trend Chart" compact>
                    {/* Chart component - DO NOT MODIFY PROPS (ui-freeze) */}
                    <TimeTrendChart
                      onDrillThrough={(value) => handleDrillThrough(`Transactions in ${value}`)}
                      height={trendChartHeight}
                    />
                  </ErrorBoundary>
                </div>

                {/* Market Compression + Absolute PSF - Side by side (Watermarked for free users) */}
                {/* Desktop/Tablet: 50/50 grid | Mobile: Stacked */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <ErrorBoundary name="Price Compression" compact>
                    <ChartWatermark>
                      <PriceCompressionChart height={compressionHeight} />
                    </ChartWatermark>
                  </ErrorBoundary>
                  <ErrorBoundary name="Absolute PSF" compact>
                    <ChartWatermark>
                      <AbsolutePsfChart height={compressionHeight} />
                    </ChartWatermark>
                  </ErrorBoundary>
                </div>

                {/* Price Distribution + Beads Chart - Side by side */}
                <div>
                  <ErrorBoundary name="Price Distribution" compact>
                    <ChartWatermark>
                      <PriceDistributionChart
                        onDrillThrough={(value) => handleDrillThrough(`Transactions at ${value}`)}
                        height={standardChartHeight}
                      />
                    </ChartWatermark>
                  </ErrorBoundary>
                </div>

                <div>
                  <ErrorBoundary name="Price by Region & Bedroom" compact>
                    <ChartWatermark>
                      <BeadsChart height={standardChartHeight} />
                    </ChartWatermark>
                  </ErrorBoundary>
                </div>

                {/* New Launch vs Resale Comparison - Full width (Watermarked for free users) */}
                <div className="lg:col-span-2">
                  <ErrorBoundary name="New vs Resale Chart" compact>
                    <ChartWatermark>
                      <NewVsResaleChart height={standardChartHeight} />
                    </ChartWatermark>
                  </ErrorBoundary>
                </div>
              </div>

          </div>
        </div>
      </div>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        additionalFilters={modalFilters}
      />

      {/* Project Detail Panel - Drill-through view (does NOT affect global charts) */}
      <ProjectDetailPanel />
    </div>
  );
}

/**
 * Standalone MacroOverview (Legacy Support)
 *
 * This export provides backward compatibility for direct usage without DashboardLayout.
 * Wraps content with its own PowerBIFilterProvider.
 *
 * For new code, prefer using MacroOverviewContent inside DashboardLayout.
 */
export default function MacroOverview() {
  return (
    <PowerBIFilterProvider>
      <MacroOverviewContent />
    </PowerBIFilterProvider>
  );
}
