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
                          <div className={`text-[12px] sm:text-[14px] font-medium ${changeColorClass}`}>
                            {arrow} {pctStr} QoQ
                          </div>
                        )}
                        {prev_score && (
                          <div className="text-[10px] sm:text-[12px] text-gray-500">
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
                          ${current_psf?.toLocaleString()} <span className="text-[14px] sm:text-[16px] font-normal">psf</span>
                        </div>
                        {pct_change != null && (
                          <div className={`text-[12px] sm:text-[14px] font-medium ${colorClass}`}>
                            {arrow} {pctStr} QoQ
                          </div>
                        )}
                        {prev_psf && (
                          <div className="text-[10px] sm:text-[12px] text-gray-500">
                            Prev: ${prev_psf?.toLocaleString()} psf
                          </div>
                        )}
                      </>
                    );
                  })()}
                  footnote={getKpi('median_psf')?.insight}
                  loading={kpis.loading}
                />

                {/* Card 3: Total Resale Transactions (last 3 months) */}
                <KPICardV2
                  title="Total Resale Transactions"
                  value={(() => {
                    const kpi = getKpi('total_transactions');
                    if (!kpi?.meta?.current_count && kpi?.meta?.current_count !== 0) return '—';
                    const { current_count, previous_count, pct_change, direction } = kpi.meta;
                    const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—';
                    const colorClass = direction === 'up' ? 'text-green-600' : direction === 'down' ? 'text-red-600' : 'text-gray-500';
                    const pctStr = pct_change != null ? (pct_change >= 0 ? `+${pct_change}%` : `${pct_change}%`) : '';
                    return (
                      <>
                        <div className="text-[22px] sm:text-[28px] font-bold text-[#213448] font-mono tabular-nums">
                          {current_count?.toLocaleString()} <span className="text-[14px] sm:text-[16px] font-normal">txns</span>
                        </div>
                        {pct_change != null && (
                          <div className={`text-[12px] sm:text-[14px] font-medium ${colorClass}`}>
                            {arrow} {pctStr} QoQ
                          </div>
                        )}
                        {previous_count != null && (
                          <div className="text-[10px] sm:text-[12px] text-gray-500">
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
                    const { prior_txns, pct_change } = kpi.meta || {};
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
                          <div className={`text-[12px] sm:text-[14px] font-medium ${changeColorClass}`}>
                            {arrow} {pctStr} QoQ
                          </div>
                        )}
                        {prior_txns != null && (
                          <div className="text-[10px] sm:text-[12px] text-gray-500">
                            Prev: {prior_txns?.toLocaleString()} txns
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
