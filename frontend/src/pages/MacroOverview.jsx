import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useInView } from 'react-intersection-observer';
// Phase 3.4: PowerBIFilterProvider removed - useZustandFilters is self-contained
import { TIME_GROUP_BY } from '../context/PowerBIFilter';
import { useZustandFilters } from '../stores/filterStore';
import { TimeTrendChart } from '../components/powerbi/TimeTrendChart';
import { PriceDistributionChart } from '../components/powerbi/PriceDistributionChart';
import { BeadsChart } from '../components/powerbi/BeadsChart';
// NewVsResaleChart moved to Primary Market page
import { SaleType, getKpiField, KpiField } from '../schemas/apiContract';
import { TransactionDetailModal } from '../components/powerbi/TransactionDetailModal';
import { ProjectDetailPanel } from '../components/powerbi/ProjectDetailPanel';
import { getKpiSummaryV2, getAggregate, getDashboard } from '../api/client';
// apiMetadata now displayed in DashboardLayout console header (useData removed)
import { transformCompressionSeries } from '../adapters';
// Standardized responsive UI components (layout wrappers only)
import { ErrorBoundary, ChartPanel, ChartWatermark, DataSection, KPICardV2, KPIHudStrip, KPIHeroContent } from '../components/ui';
import { FilterBar } from '../components/patterns';
// Containment primitives (L0 → L1 → L2 layer system for visual hierarchy)
import { PageCanvas, ControlRibbon } from '../components/layout';
// Desktop-first chart height with mobile guardrail
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useChartHeight, MOBILE_CAPS } from '../hooks/useChartHeight';
import { useAppQuery } from '../hooks/useAppQuery';
// Unified filter bar component (handles desktop + mobile)

// Lazy-loaded below-fold charts (reduces initial bundle by ~150KB)
// These charts are not immediately visible and can load on demand
const PriceCompressionChart = lazy(() => import('../components/powerbi/PriceCompressionChart').then(m => ({ default: m.PriceCompressionChart })));
const AbsolutePsfChart = lazy(() => import('../components/powerbi/AbsolutePsfChart').then(m => ({ default: m.AbsolutePsfChart })));
const MarketValueOscillator = lazy(() => import('../components/powerbi/MarketValueOscillator').then(m => ({ default: m.MarketValueOscillator })));

// Lazy loading fallback - matches chart container style
const ChartLoadingFallback = ({ height }) => (
  <div
    className="bg-white rounded-xl border border-gray-200 animate-pulse flex items-center justify-center"
    style={{ height: height || 380 }}
  >
    <div className="text-slate-400 text-sm">Loading chart...</div>
  </div>
);

/**
 * Macro Overview Page - Power BI-style Dashboard (Market Core)
 *
 * Features:
 * - Dynamic filtering with horizontal Control Bar
 * - Time grouping controls (year/quarter/month)
 * - Project drill-through: Opens ProjectDetailPanel without affecting global charts
 * - Drill-through to transaction details
 *
 * DATA SCOPE: Resale transactions ONLY
 * All charts on this page receive saleType="Resale" from page level.
 * See CLAUDE.md "Business Logic Enforcement" for architectural rationale.
 *
 * NOTE: This component is designed to be wrapped by DashboardLayout which provides:
 * - GlobalNavRail (primary navigation)
 * - Mobile responsive header and drawers
 */

// Page-level data scope - all charts inherit this
// Uses canonical enum from apiContract (lowercase: 'resale')
const SALE_TYPE = SaleType.RESALE;

export function MacroOverviewContent() {
  // apiMetadata now displayed in DashboardLayout console header
  // Phase 4: Simplified filter access - read values directly from Zustand
  const { filters, timeGrouping } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset' ? filters.timeFilter.value : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  const districts = filters.districts?.join(',') || '';

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalFilters, setModalFilters] = useState({});

  // Desktop-first chart heights with mobile guardrails
  // Desktop: exact pixels | Mobile (<768px): capped to prevent viewport domination
  // Cinema mode: shorter height + full width = panoramic aspect ratio
  const trendChartHeight = useChartHeight(340, MOBILE_CAPS.standard);     // 340px desktop - 50/50 top row
  const standardChartHeight = useChartHeight(350, MOBILE_CAPS.standard);  // 350px desktop, max 300px mobile (2-up grid)
  const compressionHeight = useChartHeight(380, MOBILE_CAPS.tall);        // 380px desktop, max 320px mobile (2-up grid)

  // Memoize KPI params to prevent object recreation on every render
  // This avoids unnecessary re-fetches when unrelated state changes
  const kpiParams = useMemo(() => {
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
    return params;
  }, [filters.districts, filters.bedroomTypes, filters.segment]);

  // Summary KPIs - Deal detection metrics with trend indicators
  // Uses v2 standardized API format with useGatedAbortableQuery for stale request protection
  // Gates on appReady to prevent fetch before auth/subscription/filters ready
  // Reacts to: Location filters (district, bedroom, segment)
  // Ignores: Date range filters (always shows "current market" status)
  const { data: kpiData, loading: kpisLoading, isBootPending: kpiBootPending } = useAppQuery(
    async (signal) => {
      // Single API call for all KPI metrics (v2 format)
      const response = await getKpiSummaryV2(kpiParams, { signal });
      return response.data.kpis || [];
    },
    [kpiParams],
    { chartName: 'MacroOverview-KPI', initialData: null, keepPreviousData: true }
  );

  // Backwards-compatible kpis object for getKpi helper
  const kpis = { items: kpiData, loading: kpisLoading };

  // Helper to get KPI by ID from the array
  const getKpi = (kpiId) => kpis.items?.find(k => getKpiField(k, KpiField.KPI_ID) === kpiId);

  // Visibility-based fetch deferral for below-the-fold charts
  // Uses react-intersection-observer library (CLAUDE.md Rule 5: Library-First)
  // initialInView: true ensures queries start immediately (skeleton shown during boot)
  const { ref: compressionRef, inView: compressionInView } = useInView({
    triggerOnce: false,
    rootMargin: '100px',
    initialInView: true,
  });

  const { ref: panelsRef, inView: panelsInView } = useInView({
    triggerOnce: false,
    rootMargin: '100px',
    initialInView: true,
  });

  // SHARED DATA FETCH: Compression/Absolute PSF/Oscillator charts use identical API call
  // Hoisted to parent to eliminate duplicate requests (W4 performance fix)
  // PriceCompressionChart, AbsolutePsfChart, and MarketValueOscillator all consume this data
  const { data: compressionRaw, status: compressionStatus, isBootPending: compressionBootPending } = useAppQuery(
    async (signal) => {
      // Phase 4: Inline params - no buildApiParams abstraction
      // Note: This chart always shows all regions for comparison (no segment/district filter)
      const params = {
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count',
        timeframe,
        bedroom,
        // segment excluded - shows all regions for comparison
        sale_type: SALE_TYPE,
      };

      const response = await getAggregate(params, { signal, priority: 'low' });
      return response.data || [];
    },
    // Explicit query key - TanStack handles cache deduplication
    ['macro-compression', timeframe, bedroom, timeGrouping],
    { chartName: 'MacroOverview-Compression', initialData: null, keepPreviousData: true, enabled: compressionInView }
  );

  // Transform raw data for compression charts (memoized to avoid re-transform on every render)
  // DESIGN: Transform is grain-agnostic - trusts data's own periodGrain
  const compressionData = useMemo(
    () => transformCompressionSeries(compressionRaw),
    [compressionRaw]
  );

  // Shared dashboard panels for histogram + beads (reduces request fanout)
  // These panels respect global sidebar filters but exclude location drill
  const { data: dashboardPanels, status: dashboardStatus, isBootPending: dashboardBootPending } = useAppQuery(
    async (signal) => {
      // Phase 4: Inline params - no buildApiParams abstraction
      const params = {
        panels: 'price_histogram,beads_chart',
        timeframe,
        bedroom,
        // Note: location drill excluded - these panels show global distribution
        sale_type: SALE_TYPE,
      };

      const response = await getDashboard(params, { signal, priority: 'medium' });
      // axios interceptor already unwraps envelope: response.data = { price_histogram, beads_chart }
      return response.data || {};
    },
    // Explicit query key - TanStack handles cache deduplication
    ['macro-dashboard', timeframe, bedroom],
    { chartName: 'MacroOverview-Dashboard', initialData: null, keepPreviousData: true, enabled: panelsInView }
  );

  const handleDrillThrough = (title, additionalFilters = {}) => {
    setModalTitle(title);
    setModalFilters(additionalFilters);
    setModalOpen(true);
  };

  return (
    <PageCanvas>
      {/* Filter Bar - Contained in sticky ribbon */}
      <ControlRibbon>
        <FilterBar />
      </ControlRibbon>

      {/* Analytics View - Dashboard with charts */}
      <div className="animate-view-enter">
        {/* KPI Section - Unified HUD Strip with technical panel aesthetic */}
        <KPIHudStrip title="KEY METRICS" columns={4} className="mb-4 md:mb-6">
          {/* Cell 1: Market Momentum */}
          <KPICardV2
            variant="cell"
            title="Market Momentum"
            value={(() => {
              const kpi = getKpi('market_momentum');
              if (!kpi?.meta?.current_score) return '—';
              const { current_score, prev_score, score_change_pct, change_direction, condition_direction, label } = kpi.meta;
              const badgeColor = condition_direction === 'up' ? 'green' : condition_direction === 'down' ? 'red' : 'gray';
              return (
                <KPIHeroContent
                  value={current_score}
                  badge={label ? { text: label, color: badgeColor } : undefined}
                  change={score_change_pct != null ? { value: score_change_pct, direction: change_direction } : undefined}
                  previous={prev_score ? { value: prev_score } : undefined}
                />
              );
            })()}
            footnote={getKpiField(getKpi('market_momentum'), KpiField.INSIGHT)}
            tooltip={getKpi('market_momentum')?.meta?.description}
            loading={kpis.loading}
          />

          {/* Cell 2: Resale Median PSF (Q-o-Q) */}
          <KPICardV2
            variant="cell"
            title="Resale Median PSF"
            value={(() => {
              const kpi = getKpi('median_psf');
              if (!kpi?.meta?.current_psf) return '—';
              const { current_psf, prev_psf, pct_change, direction } = kpi.meta;
              return (
                <KPIHeroContent
                  value={`$${current_psf?.toLocaleString()}`}
                  unit="psf"
                  change={pct_change != null ? { value: pct_change, direction } : undefined}
                  previous={prev_psf ? { value: `$${prev_psf?.toLocaleString()} psf` } : undefined}
                />
              );
            })()}
            footnote={getKpiField(getKpi('median_psf'), KpiField.INSIGHT)}
            tooltip={getKpi('median_psf')?.meta?.description}
            loading={kpis.loading}
          />

          {/* Cell 3: Total Resale Transactions (last 3 months) */}
          <KPICardV2
            variant="cell"
            title="Total Resale Txns"
            value={(() => {
              const kpi = getKpi('total_transactions');
              if (!kpi?.meta?.current_count && kpi?.meta?.current_count !== 0) return '—';
              const { current_count, previous_count, pct_change, direction, label } = kpi.meta;
              const badgeColor = direction === 'up' ? 'green' : direction === 'down' ? 'red' : 'gray';
              return (
                <KPIHeroContent
                  value={current_count?.toLocaleString()}
                  badge={label ? { text: label, color: badgeColor } : undefined}
                  change={pct_change != null ? { value: pct_change, direction } : undefined}
                  previous={previous_count != null ? { value: `${previous_count?.toLocaleString()} txns` } : undefined}
                />
              );
            })()}
            footnote={getKpiField(getKpi('total_transactions'), KpiField.INSIGHT)}
            tooltip={getKpi('total_transactions')?.meta?.description}
            loading={kpis.loading}
          />

          {/* Cell 4: Annualized Resale Velocity */}
          <KPICardV2
            variant="cell"
            title="Resale Velocity"
            value={(() => {
              const kpi = getKpi('resale_velocity');
              if (!kpi?.value && kpi?.value !== 0) return '—';
              const { prior_annualized, pct_change } = kpi.meta || {};
              const trend = getKpiField(kpi, KpiField.TREND);
              const direction = trend?.direction;
              const label = trend?.label;
              const badgeColor = direction === 'up' ? 'green' : direction === 'down' ? 'red' : 'gray';
              // Change direction based on pct_change sign (separate from badge direction)
              const changeDirection = pct_change > 0 ? 'up' : pct_change < 0 ? 'down' : 'neutral';
              return (
                <KPIHeroContent
                  value={getKpiField(kpi, KpiField.FORMATTED_VALUE)}
                  badge={label ? { text: label, color: badgeColor } : undefined}
                  change={pct_change != null ? { value: pct_change, direction: changeDirection } : undefined}
                  previous={prior_annualized != null ? { value: `${prior_annualized}%` } : undefined}
                />
              );
            })()}
            footnote={getKpiField(getKpi('resale_velocity'), KpiField.INSIGHT)}
            tooltip={getKpi('resale_velocity')?.meta?.description}
            loading={kpis.loading}
          />
        </KPIHudStrip>

        {/* Charts Section - Market trend analysis */}
        <DataSection title="MARKET TRENDS">
          {/* Charts Grid - Responsive: 1 col mobile, 2 cols desktop */}
          {/* Each chart wrapped with ErrorBoundary to prevent cascade failures */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Time Trend Chart - Full width */}
                <ChartPanel className="lg:col-span-2">
                  <ErrorBoundary name="Time Trend Chart" compact>
                    <TimeTrendChart
                      onDrillThrough={(value) => handleDrillThrough(`Transactions in ${value}`)}
                      height={trendChartHeight}
                      saleType={SALE_TYPE}
                      staggerIndex={0}
                      variant="dashboard"
                    />
                  </ErrorBoundary>
                </ChartPanel>

                {/* Absolute PSF by Region - Full width below Time Trend */}
                <ChartPanel ref={compressionRef} className="lg:col-span-2">
                  <ErrorBoundary name="Absolute PSF" compact>
                    <ChartWatermark>
                      <Suspense fallback={<ChartLoadingFallback height={trendChartHeight} />}>
                        <AbsolutePsfChart
                          height={trendChartHeight}
                          saleType={SALE_TYPE}
                          sharedData={compressionData}
                          sharedStatus={compressionInView ? compressionStatus : 'pending'}
                          staggerIndex={1}
                          variant="dashboard"
                        />
                      </Suspense>
                    </ChartWatermark>
                  </ErrorBoundary>
                </ChartPanel>

                {/* HORIZON LINE - Technical divider */}
                <div className="lg:col-span-2 border-t border-dashed border-slate-400 my-2" />

                {/* Market Compression Analysis - Full width */}
                <ChartPanel className="lg:col-span-2">
                  <ErrorBoundary name="Price Compression" compact>
                    <ChartWatermark>
                      <Suspense fallback={<ChartLoadingFallback height={compressionHeight} />}>
                        <PriceCompressionChart
                          height={compressionHeight}
                          saleType={SALE_TYPE}
                          sharedData={compressionData}
                          sharedStatus={compressionInView ? compressionStatus : 'pending'}
                          staggerIndex={2}
                          variant="dashboard"
                        />
                      </Suspense>
                    </ChartWatermark>
                  </ErrorBoundary>
                </ChartPanel>

                {/* Market Value Oscillator - Full width */}
                <ChartPanel className="lg:col-span-2">
                  <ErrorBoundary name="Market Value Oscillator" compact>
                    <ChartWatermark>
                      <Suspense fallback={<ChartLoadingFallback height={compressionHeight} />}>
                        <MarketValueOscillator
                          height={compressionHeight}
                          saleType={SALE_TYPE}
                          sharedRawData={compressionRaw}
                          sharedStatus={compressionInView ? compressionStatus : 'pending'}
                          staggerIndex={3}
                          variant="dashboard"
                        />
                      </Suspense>
                    </ChartWatermark>
                  </ErrorBoundary>
                </ChartPanel>

                {/* HORIZON LINE - Divider before bottom row */}
                <div className="lg:col-span-2 border-t border-dashed border-slate-400 my-2" />

                {/* Price Distribution - Full width */}
                <ChartPanel ref={panelsRef} className="lg:col-span-2">
                  <ErrorBoundary name="Price Distribution" compact>
                    <ChartWatermark>
                      <PriceDistributionChart
                        onDrillThrough={(value) => handleDrillThrough(`Transactions at ${value}`)}
                        height={standardChartHeight}
                        saleType={SALE_TYPE}
                        sharedData={dashboardPanels?.price_histogram}
                        sharedStatus={panelsInView ? dashboardStatus : 'pending'}
                        staggerIndex={4}
                        variant="dashboard"
                      />
                    </ChartWatermark>
                  </ErrorBoundary>
                </ChartPanel>

                {/* Beads Chart - Full width */}
                <ChartPanel className="lg:col-span-2">
                  <ErrorBoundary name="Price by Region & Bedroom" compact>
                    <ChartWatermark>
                      <BeadsChart
                        height={standardChartHeight}
                        saleType={SALE_TYPE}
                        sharedData={dashboardPanels?.beads_chart}
                        sharedStatus={panelsInView ? dashboardStatus : 'pending'}
                        staggerIndex={5}
                        variant="dashboard"
                      />
                    </ChartWatermark>
                  </ErrorBoundary>
                </ChartPanel>
          </div>
        </DataSection>
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
    </PageCanvas>
  );
}

/**
 * Standalone MacroOverview (Legacy Support)
 *
 * This export provides backward compatibility for direct usage without DashboardLayout.
 * Phase 3.4: No longer needs PowerBIFilterProvider - useZustandFilters is self-contained.
 *
 * For new code, prefer using MacroOverviewContent inside DashboardLayout.
 */
export default function MacroOverview() {
  return <MacroOverviewContent />;
}
