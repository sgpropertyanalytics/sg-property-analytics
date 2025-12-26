import React, { useState, useEffect } from 'react';
import { PowerBIFilterProvider, usePowerBIFilters } from '../context/PowerBIFilterContext';
import { TimeTrendChart } from '../components/powerbi/TimeTrendChart';
import { MedianPsfTrendChart } from '../components/powerbi/MedianPsfTrendChart';
import { PriceDistributionChart } from '../components/powerbi/PriceDistributionChart';
import { NewVsResaleChart } from '../components/powerbi/NewVsResaleChart';
import { PriceCompressionChart } from '../components/powerbi/PriceCompressionChart';
import { TransactionDetailModal } from '../components/powerbi/TransactionDetailModal';
import { DrillBreadcrumb } from '../components/powerbi/DrillBreadcrumb';
import { TimeGranularityToggle } from '../components/powerbi/TimeGranularityToggle';
import { GLSDataTable } from '../components/powerbi/GLSDataTable';
import { UpcomingLaunchesTable } from '../components/powerbi/UpcomingLaunchesTable';
import { ProjectDetailPanel } from '../components/powerbi/ProjectDetailPanel';
import { getKpiSummary } from '../api/client';
import { useData } from '../context/DataContext';
// Standardized responsive UI components (layout wrappers only)
import { KPICard, ErrorBoundary, ChartWatermark } from '../components/ui';
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
  const {
    filters,
    crossFilter,
    highlight,
    clearCrossFilter,
    clearHighlight,
  } = usePowerBIFilters();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalFilters, setModalFilters] = useState({});

  // Desktop-first chart heights with mobile guardrails
  // Desktop: exact pixels | Mobile (<768px): capped to prevent viewport domination
  const trendChartHeight = useChartHeight(280, MOBILE_CAPS.compact);      // 280px desktop, max 260px mobile
  const standardChartHeight = useChartHeight(350, MOBILE_CAPS.standard);  // 350px desktop, max 300px mobile
  const compressionHeight = useChartHeight(380, MOBILE_CAPS.tall);        // 380px desktop, max 320px mobile

  // Summary KPIs - Deal detection metrics with trend indicators
  // Uses single optimized API call for fast loading
  // Reacts to: Location filters (district, bedroom, segment)
  // Ignores: Date range filters (always shows "current market" status)
  const [kpis, setKpis] = useState({
    medianPsf: { current: 0, trend: 0, insight: '' },
    priceSpread: { iqrRatio: 0, label: 'Loading', insight: '' },
    newLaunchPremium: { value: 0, trend: 'stable', insight: '' },
    marketMomentum: { score: 50, label: 'Loading', insight: '' },
    loading: true,
  });

  // Fetch KPIs using single optimized API call
  useEffect(() => {
    const fetchKpis = async () => {
      try {
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

        // Single API call for all KPI metrics
        const response = await getKpiSummary(params);
        const data = response.data;

        setKpis({
          medianPsf: {
            current: data.medianPsf.current,
            trend: data.medianPsf.trend,
            insight: data.insights.psf,
          },
          priceSpread: {
            iqrRatio: data.priceSpread.iqrRatio,
            label: data.priceSpread.label,
            insight: data.insights.spread,
          },
          newLaunchPremium: {
            value: data.newLaunchPremium.value,
            trend: data.newLaunchPremium.trend,
            insight: data.insights.premium,
          },
          marketMomentum: {
            score: data.marketMomentum.score,
            label: data.marketMomentum.label,
            insight: data.insights.momentum,
          },
          loading: false,
        });
      } catch (err) {
        console.error('Error fetching KPIs:', err);
        setKpis(prev => ({ ...prev, loading: false }));
      }
    };
    fetchKpis();
  }, [filters.districts, filters.bedroomTypes, filters.segment]); // Re-fetch when location filters change

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

                {/* Highlight indicator (visual emphasis on time, no filtering) */}
                {highlight.value && (
                  <button
                    onClick={clearHighlight}
                    className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-[#213448]/10 text-[#213448] rounded-lg hover:bg-[#213448]/20 transition-colors text-xs sm:text-sm border border-[#213448]/20"
                  >
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span className="truncate max-w-[100px] sm:max-w-none">{highlight.value}</span>
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {/* Cross-filter indicator (actual data filtering) */}
                {crossFilter.value && (
                  <button
                    onClick={clearCrossFilter}
                    className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-[#547792]/20 text-[#213448] rounded-lg hover:bg-[#547792]/30 transition-colors text-xs sm:text-sm"
                  >
                    <span className="truncate max-w-[100px] sm:max-w-none">{crossFilter.value}</span>
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Breadcrumb navigation */}
            <DrillBreadcrumb />
          </div>

          {/* Analytics View - Dashboard with charts */}
          <div className="animate-view-enter">
              {/* KPI Summary Cards with Insight Boxes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
                {/* Card 1: Market Median PSF */}
                <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
                  {/* Insight Box */}
                  <div className="bg-[#213448] px-3 py-2 text-white">
                    <span className="text-[10px] md:text-xs">{kpis.loading ? 'Loading...' : kpis.medianPsf.insight}</span>
                  </div>
                  {/* Number Display */}
                  <div className="p-3 md:p-4">
                    <div className="text-xs text-[#547792] mb-1">Market Median PSF</div>
                    {kpis.loading ? (
                      <div className="h-8 bg-[#94B4C1]/30 rounded animate-pulse" />
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl md:text-3xl font-bold text-[#213448]">
                          ${kpis.medianPsf.current.toLocaleString()}
                        </span>
                        {kpis.medianPsf.trend !== null && (
                          <span className={`text-xs font-medium ${kpis.medianPsf.trend > 0 ? 'text-red-500' : kpis.medianPsf.trend < 0 ? 'text-green-600' : 'text-[#547792]'}`}>
                            {kpis.medianPsf.trend > 0 ? '+' : ''}{kpis.medianPsf.trend}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 2: Price Spread (IQR) */}
                <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
                  <div className="bg-[#213448] px-3 py-2 text-white">
                    <span className="text-[10px] md:text-xs">{kpis.loading ? 'Loading...' : kpis.priceSpread.insight}</span>
                  </div>
                  <div className="p-3 md:p-4">
                    <div className="text-xs text-[#547792] mb-1">Price Spread (IQR)</div>
                    {kpis.loading ? (
                      <div className="h-8 bg-[#94B4C1]/30 rounded animate-pulse" />
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl md:text-3xl font-bold text-[#213448]">
                          {kpis.priceSpread.iqrRatio}%
                        </span>
                        <span className="text-xs text-[#547792]">{kpis.priceSpread.label}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 3: New Launch Premium */}
                <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
                  <div className="bg-[#213448] px-3 py-2 text-white">
                    <span className="text-[10px] md:text-xs">{kpis.loading ? 'Loading...' : kpis.newLaunchPremium.insight}</span>
                  </div>
                  <div className="p-3 md:p-4">
                    <div className="text-xs text-[#547792] mb-1">New Launch Premium</div>
                    {kpis.loading ? (
                      <div className="h-8 bg-[#94B4C1]/30 rounded animate-pulse" />
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl md:text-3xl font-bold text-[#213448]">
                          {kpis.newLaunchPremium.value > 0 ? '+' : ''}{kpis.newLaunchPremium.value}%
                        </span>
                        <span className="text-xs text-[#547792]">{kpis.newLaunchPremium.trend}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 4: Market Momentum */}
                <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
                  <div className="bg-[#213448] px-3 py-2 text-white">
                    <span className="text-[10px] md:text-xs">{kpis.loading ? 'Loading...' : kpis.marketMomentum.insight}</span>
                  </div>
                  <div className="p-3 md:p-4">
                    <div className="text-xs text-[#547792] mb-1">Market Momentum</div>
                    {kpis.loading ? (
                      <div className="h-8 bg-[#94B4C1]/30 rounded animate-pulse" />
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl md:text-3xl font-bold text-[#213448]">
                          {kpis.marketMomentum.score}
                        </span>
                        <span className="text-xs text-[#547792]">{kpis.marketMomentum.label}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

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

                {/* Median PSF Trend Chart - Full width, shows price trends by CCR/RCR/OCR */}
                <div className="lg:col-span-2">
                  <ErrorBoundary name="Median PSF Trend" compact>
                    <MedianPsfTrendChart height={trendChartHeight} />
                  </ErrorBoundary>
                </div>

                {/* Price Distribution - Histogram Full width (Watermarked for free users) */}
                <div className="lg:col-span-2">
                  <ErrorBoundary name="Price Distribution" compact>
                    <ChartWatermark>
                      <PriceDistributionChart
                        onDrillThrough={(value) => handleDrillThrough(`Transactions at ${value}`)}
                        height={standardChartHeight}
                      />
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

                {/* Price Compression Analysis - Full width (Watermarked for free users) */}
                <div className="lg:col-span-2">
                  <ErrorBoundary name="Price Compression" compact>
                    <ChartWatermark>
                      <PriceCompressionChart height={compressionHeight} />
                    </ChartWatermark>
                  </ErrorBoundary>
                </div>
              </div>

              {/* GLS Data Table - Government Land Sales */}
              <div className="mb-4 md:mb-6">
                <ErrorBoundary name="GLS Data Table" compact>
                  <GLSDataTable height={standardChartHeight} />
                </ErrorBoundary>
              </div>

              {/* Upcoming Launches Table - Pre-launch projects (not yet launched) */}
              <div className="mb-4 md:mb-6">
                <ErrorBoundary name="Upcoming Launches" compact>
                  <UpcomingLaunchesTable height={standardChartHeight} />
                </ErrorBoundary>
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
