import React, { useState, lazy, Suspense } from 'react';
import { PowerBIFilterProvider, usePowerBIFilters, TIME_GROUP_BY } from '../context/PowerBIFilterContext';
import { TimeTrendChart } from '../components/powerbi/TimeTrendChart';
import { PriceDistributionChart } from '../components/powerbi/PriceDistributionChart';
import { BeadsChart } from '../components/powerbi/BeadsChart';
// NewVsResaleChart moved to Primary Market page
import { SaleType } from '../schemas/apiContract';
import { TransactionDetailModal } from '../components/powerbi/TransactionDetailModal';
import { DrillBreadcrumb } from '../components/powerbi/DrillBreadcrumb';
import { ProjectDetailPanel } from '../components/powerbi/ProjectDetailPanel';
import { getKpiSummaryV2, getAggregate } from '../api/client';
import { useData } from '../context/DataContext';
import { transformCompressionSeries } from '../adapters';
// Standardized responsive UI components (layout wrappers only)
import { ErrorBoundary, ChartWatermark, KPICardV2, KPICardV2Group } from '../components/ui';
// Desktop-first chart height with mobile guardrail
import { useChartHeight, MOBILE_CAPS, useAbortableQuery } from '../hooks';
// Horizontal filter bar (refactored from sidebar)
import { PowerBIFilterSidebar } from '../components/powerbi/PowerBIFilterSidebar';
import { TimeGranularityToggle } from '../components/powerbi/TimeGranularityToggle';

// Lazy-loaded below-fold charts (reduces initial bundle by ~150KB)
// These charts are not immediately visible and can load on demand
const PriceCompressionChart = lazy(() => import('../components/powerbi/PriceCompressionChart').then(m => ({ default: m.PriceCompressionChart })));
const AbsolutePsfChart = lazy(() => import('../components/powerbi/AbsolutePsfChart').then(m => ({ default: m.AbsolutePsfChart })));
const MarketValueOscillator = lazy(() => import('../components/powerbi/MarketValueOscillator').then(m => ({ default: m.MarketValueOscillator })));

// Lazy loading fallback - matches chart container style
const ChartLoadingFallback = ({ height }) => (
  <div
    className="bg-white rounded-lg border border-gray-200 animate-pulse flex items-center justify-center"
    style={{ height: height || 380 }}
  >
    <div className="text-gray-400 text-sm">Loading chart...</div>
  </div>
);

/**
 * Macro Overview Page - Power BI-style Dashboard (Market Core)
 *
 * Features:
 * - Dynamic filtering with horizontal Control Bar
 * - Cross-filtering (click chart to filter others)
 * - Drill-down hierarchies:
 *   - Time: year -> quarter -> month
 *   - Location: region -> district (global hierarchy stops here)
 * - Project drill-through: Opens ProjectDetailPanel without affecting global charts
 * - Drill-through to transaction details
 *
 * DATA SCOPE: Resale transactions ONLY
 * All charts on this page receive saleType="Resale" from page level.
 * See CLAUDE.md "Business Logic Enforcement" for architectural rationale.
 *
 * NOTE: This component is designed to be wrapped by DashboardLayout which provides:
 * - PowerBIFilterProvider context
 * - GlobalNavRail (primary navigation)
 * - Mobile responsive header and drawers
 */

// Page-level data scope - all charts inherit this
// Uses canonical enum from apiContract (lowercase: 'resale')
const SALE_TYPE = SaleType.RESALE;

export function MacroOverviewContent() {
  const { apiMetadata } = useData();
  const { filters, buildApiParams, debouncedFilterKey, timeGrouping } = usePowerBIFilters();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalFilters, setModalFilters] = useState({});
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Mobile filter button component
  const MobileFilterButton = () => {
    const { activeFilterCount } = usePowerBIFilters();
    return (
      <div className="md:hidden">
        <div className="p-3 bg-card/60 rounded-lg backdrop-blur-sm">
          <button
            onClick={() => setMobileFilterOpen(true)}
            className="w-full min-h-[44px] px-4 flex items-center justify-center gap-2 bg-card/80 rounded-lg border border-[#94B4C1]/30 text-[#547792] hover:border-[#547792] active:bg-[#EAE0CF]/50 active:scale-[0.98] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-[#213448] text-white text-xs font-medium px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile Filter Drawer */}
        {mobileFilterOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileFilterOpen(false)} />
            <div className="absolute inset-y-0 right-0 w-full max-w-sm animate-slide-in-right">
              <PowerBIFilterSidebar layout="drawer" onClose={() => setMobileFilterOpen(false)} />
            </div>
          </div>
        )}
      </div>
    );
  };

  // Desktop-first chart heights with mobile guardrails
  // Desktop: exact pixels | Mobile (<768px): capped to prevent viewport domination
  const trendChartHeight = useChartHeight(280, MOBILE_CAPS.compact);      // 280px desktop, max 260px mobile
  const standardChartHeight = useChartHeight(350, MOBILE_CAPS.standard);  // 350px desktop, max 300px mobile
  const compressionHeight = useChartHeight(380, MOBILE_CAPS.tall);        // 380px desktop, max 320px mobile
  const oscillatorHeight = useChartHeight(420, MOBILE_CAPS.tall);         // 420px desktop, max 320px mobile (full-width chart)

  // Summary KPIs - Deal detection metrics with trend indicators
  // Uses v2 standardized API format with useAbortableQuery for stale request protection
  // Reacts to: Location filters (district, bedroom, segment)
  // Ignores: Date range filters (always shows "current market" status)
  const { data: kpiData, loading: kpisLoading } = useAbortableQuery(
    async (signal) => {
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
      const response = await getKpiSummaryV2(params, { signal });
      return response.data.kpis || [];
    },
    [filters.districts, filters.bedroomTypes, filters.segment],
    { initialData: [], keepPreviousData: true }
  );

  // Backwards-compatible kpis object for getKpi helper
  const kpis = { items: kpiData, loading: kpisLoading };

  // Helper to get KPI by ID from the array
  const getKpi = (kpiId) => kpis.items.find(k => k.kpi_id === kpiId);

  // SHARED DATA FETCH: Compression/Absolute PSF charts use identical API call
  // Hoisted to parent to eliminate duplicate request (W4 performance fix)
  // Both PriceCompressionChart and AbsolutePsfChart consume this data
  const { data: compressionData, loading: compressionLoading } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count',
        sale_type: SALE_TYPE,
      }, { excludeOwnDimension: 'segment' });

      const response = await getAggregate(params, { signal });
      const rawData = response.data?.data || [];
      return transformCompressionSeries(rawData, timeGrouping);
    },
    [debouncedFilterKey, timeGrouping],
    { initialData: [], keepPreviousData: true }
  );

  const handleDrillThrough = (title, additionalFilters = {}) => {
    setModalTitle(title);
    setModalFilters(additionalFilters);
    setModalOpen(true);
  };

  return (
    <div className="h-full bg-[#EAE0CF]/40">
      {/* Main Content Area - Scrollable (vertical only, no horizontal) */}
      <div className="h-full overflow-y-auto overflow-x-hidden">
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
            {/* Time Granularity Toggle - controls chart time aggregation */}
            <div className="flex-shrink-0">
              <TimeGranularityToggle />
            </div>
          </div>

          {/* Breadcrumb navigation */}
          <DrillBreadcrumb />
        </div>

        {/* Filter Bar - Horizontal filter controls */}
        <div className="mb-6">
          {/* Desktop: Horizontal bar */}
          <div className="hidden md:block">
            <PowerBIFilterSidebar layout="horizontal" />
          </div>
          {/* Mobile: Filter button + drawer */}
          <MobileFilterButton />
        </div>

        {/* Analytics View - Dashboard with charts */}
        <div className="animate-view-enter">
              {/* KPI Summary Cards - Using standardized KPICardV2 */}
              <KPICardV2Group columns={4} className="mb-4 md:mb-6">
                {/* Card 1: Market Momentum */}
                <KPICardV2
                  title="Market Momentum"
                  value={(() => {
                    const kpi = getKpi('market_momentum');
                    if (!kpi?.meta?.current_score) return '—';
                    const { current_score, prev_score, score_change_pct, change_direction, condition_direction, label } = kpi.meta;
                    // Arrow based on score CHANGE direction
                    const arrow = change_direction === 'up' ? '▲' : change_direction === 'down' ? '▼' : '—';
                    const changeColorClass = change_direction === 'up' ? 'text-green-600' : change_direction === 'down' ? 'text-red-600' : 'text-gray-500';
                    // Label color based on market CONDITION
                    const conditionColorClass = condition_direction === 'up' ? 'text-green-600' : condition_direction === 'down' ? 'text-red-600' : 'text-gray-500';
                    const pctStr = score_change_pct != null ? (score_change_pct >= 0 ? `+${score_change_pct}%` : `${score_change_pct}%`) : '';
                    return (
                      <>
                        <div className="text-[22px] sm:text-[28px] font-bold text-[#213448] font-mono tabular-nums">
                          {current_score} <span className={`text-xs font-bold uppercase tracking-wider ${conditionColorClass}`}>{label}</span>
                        </div>
                        {score_change_pct != null && (
                          <div className={`text-xs sm:text-sm font-medium ${changeColorClass}`}>
                            {arrow} {pctStr} QoQ
                          </div>
                        )}
                        {prev_score && (
                          <div className="text-[10px] sm:text-xs text-gray-500">
                            Prev: {prev_score}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  footnote={getKpi('market_momentum')?.insight}
                  tooltip={getKpi('market_momentum')?.meta?.description}
                  loading={kpis.loading}
                />

                {/* Card 2: Resale Median PSF (Q-o-Q) */}
                <KPICardV2
                  title="Resale Median PSF"
                  value={(() => {
                    const kpi = getKpi('median_psf');
                    if (!kpi?.meta?.current_psf) return '—';
                    const { current_psf, prev_psf, pct_change, direction } = kpi.meta;
                    const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—';
                    const colorClass = direction === 'up' ? 'text-green-600' : direction === 'down' ? 'text-red-600' : 'text-gray-500';
                    const pctStr = pct_change != null ? (pct_change >= 0 ? `+${pct_change}%` : `${pct_change}%`) : '';
                    return (
                      <>
                        <div className="text-[22px] sm:text-[28px] font-bold text-[#213448] font-mono tabular-nums">
                          ${current_psf?.toLocaleString()} <span className="text-sm sm:text-base font-normal">psf</span>
                        </div>
                        {pct_change != null && (
                          <div className={`text-xs sm:text-sm font-medium ${colorClass}`}>
                            {arrow} {pctStr} QoQ
                          </div>
                        )}
                        {prev_psf && (
                          <div className="text-[10px] sm:text-xs text-gray-500">
                            Prev: ${prev_psf?.toLocaleString()} psf
                          </div>
                        )}
                      </>
                    );
                  })()}
                  footnote={getKpi('median_psf')?.insight}
                  tooltip={getKpi('median_psf')?.meta?.description}
                  loading={kpis.loading}
                />

                {/* Card 3: Total Resale Transactions (last 3 months) */}
                <KPICardV2
                  title="Total Resale Transactions"
                  value={(() => {
                    const kpi = getKpi('total_transactions');
                    if (!kpi?.meta?.current_count && kpi?.meta?.current_count !== 0) return '—';
                    const { current_count, previous_count, pct_change, direction, label } = kpi.meta;
                    const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—';
                    const colorClass = direction === 'up' ? 'text-green-600' : direction === 'down' ? 'text-red-600' : 'text-gray-500';
                    const pctStr = pct_change != null ? (pct_change >= 0 ? `+${pct_change}%` : `${pct_change}%`) : '';
                    return (
                      <>
                        <div className="text-[22px] sm:text-[28px] font-bold text-[#213448] font-mono tabular-nums">
                          {current_count?.toLocaleString()} <span className={`text-xs font-bold uppercase tracking-wider ${colorClass}`}>{label}</span>
                        </div>
                        {pct_change != null && (
                          <div className={`text-xs sm:text-sm font-medium ${colorClass}`}>
                            {arrow} {pctStr} QoQ
                          </div>
                        )}
                        {previous_count != null && (
                          <div className="text-[10px] sm:text-xs text-gray-500">
                            Prev: {previous_count?.toLocaleString()} txns
                          </div>
                        )}
                      </>
                    );
                  })()}
                  footnote={getKpi('total_transactions')?.insight}
                  tooltip={getKpi('total_transactions')?.meta?.description}
                  loading={kpis.loading}
                />

                {/* Card 4: Annualized Resale Velocity */}
                <KPICardV2
                  title="Annualized Resale Velocity"
                  value={(() => {
                    const kpi = getKpi('resale_velocity');
                    if (!kpi?.value && kpi?.value !== 0) return '—';
                    const { prior_annualized, pct_change } = kpi.meta || {};
                    const direction = kpi.trend?.direction;
                    const label = kpi.trend?.label;
                    const labelColorClass = direction === 'up' ? 'text-green-600' : direction === 'down' ? 'text-red-600' : 'text-gray-500';
                    const arrow = pct_change > 0 ? '▲' : pct_change < 0 ? '▼' : '—';
                    const changeColorClass = pct_change > 0 ? 'text-green-600' : pct_change < 0 ? 'text-red-600' : 'text-gray-500';
                    const pctStr = pct_change != null ? (pct_change >= 0 ? `+${pct_change}%` : `${pct_change}%`) : '';
                    return (
                      <>
                        <div className="text-[22px] sm:text-[28px] font-bold text-[#213448] font-mono tabular-nums">
                          {kpi.formatted_value} <span className={`text-xs font-bold uppercase tracking-wider ${labelColorClass}`}>{label}</span>
                        </div>
                        {pct_change != null && (
                          <div className={`text-xs sm:text-sm font-medium ${changeColorClass}`}>
                            {arrow} {pctStr} QoQ
                          </div>
                        )}
                        {prior_annualized != null && (
                          <div className="text-[10px] sm:text-xs text-gray-500">
                            Prev: {prior_annualized}%
                          </div>
                        )}
                      </>
                    );
                  })()}
                  footnote={getKpi('resale_velocity')?.insight}
                  tooltip={getKpi('resale_velocity')?.meta?.description}
                  loading={kpis.loading}
                />
              </KPICardV2Group>

              {/* Charts Grid - Responsive: 1 col mobile, 2 cols desktop */}
              {/* Each chart wrapped with ErrorBoundary to prevent cascade failures */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
                {/* Time Trend Chart - Full width on all screens */}
                <div className="lg:col-span-2">
                  <ErrorBoundary name="Time Trend Chart" compact>
                    <TimeTrendChart
                      onDrillThrough={(value) => handleDrillThrough(`Transactions in ${value}`)}
                      height={trendChartHeight}
                      saleType={SALE_TYPE}
                    />
                  </ErrorBoundary>
                </div>

                {/* Market Compression + Absolute PSF - Side by side (Watermarked for free users) */}
                {/* Desktop/Tablet: 50/50 grid | Mobile: Stacked */}
                {/* Lazy-loaded with Suspense for faster initial page load */}
                {/* SHARED DATA: Both charts receive pre-fetched compressionData (W4 fix) */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <ErrorBoundary name="Price Compression" compact>
                    <ChartWatermark>
                      <Suspense fallback={<ChartLoadingFallback height={compressionHeight} />}>
                        <PriceCompressionChart
                          height={compressionHeight}
                          saleType={SALE_TYPE}
                          sharedData={compressionData}
                          sharedLoading={compressionLoading}
                        />
                      </Suspense>
                    </ChartWatermark>
                  </ErrorBoundary>
                  <ErrorBoundary name="Absolute PSF" compact>
                    <ChartWatermark>
                      <Suspense fallback={<ChartLoadingFallback height={compressionHeight} />}>
                        <AbsolutePsfChart
                          height={compressionHeight}
                          saleType={SALE_TYPE}
                          sharedData={compressionData}
                          sharedLoading={compressionLoading}
                        />
                      </Suspense>
                    </ChartWatermark>
                  </ErrorBoundary>
                </div>

                {/* Market Value Oscillator - Full width, Z-score normalized spread analysis */}
                {/* Lazy-loaded with Suspense for faster initial page load */}
                <div className="lg:col-span-2">
                  <ErrorBoundary name="Market Value Oscillator" compact>
                    <ChartWatermark>
                      <Suspense fallback={<ChartLoadingFallback height={oscillatorHeight} />}>
                        <MarketValueOscillator height={oscillatorHeight} saleType={SALE_TYPE} />
                      </Suspense>
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
                        saleType={SALE_TYPE}
                      />
                    </ChartWatermark>
                  </ErrorBoundary>
                </div>

                <div>
                  <ErrorBoundary name="Price by Region & Bedroom" compact>
                    <ChartWatermark>
                      <BeadsChart height={standardChartHeight} saleType={SALE_TYPE} />
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
