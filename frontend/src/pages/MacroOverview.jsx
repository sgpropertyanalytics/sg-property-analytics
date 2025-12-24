import React, { useState, useEffect } from 'react';
import { PowerBIFilterProvider, usePowerBIFilters } from '../context/PowerBIFilterContext';
import { TimeTrendChart } from '../components/powerbi/TimeTrendChart';
import { MedianPsfTrendChart } from '../components/powerbi/MedianPsfTrendChart';
import { UnitSizeVsPriceChart } from '../components/powerbi/UnitSizeVsPriceChart';
import { PriceDistributionChart } from '../components/powerbi/PriceDistributionChart';
import { NewVsResaleChart } from '../components/powerbi/NewVsResaleChart';
import { PriceCompressionChart } from '../components/powerbi/PriceCompressionChart';
import { TransactionDetailModal } from '../components/powerbi/TransactionDetailModal';
import { DrillBreadcrumb } from '../components/powerbi/DrillBreadcrumb';
import { TimeGranularityToggle } from '../components/powerbi/TimeGranularityToggle';
import { TransactionDataTable } from '../components/powerbi/TransactionDataTable';
import { GLSDataTable } from '../components/powerbi/GLSDataTable';
import { UpcomingLaunchesTable } from '../components/powerbi/UpcomingLaunchesTable';
import { ProjectDetailPanel } from '../components/powerbi/ProjectDetailPanel';
import { getAggregate, getNewVsResale, getDashboard } from '../api/client';
import { useData } from '../context/DataContext';
// Standardized responsive UI components (layout wrappers only)
import { KPICard, ErrorBoundary } from '../components/ui';
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
  const tableHeight = useChartHeight(400, MOBILE_CAPS.tall);              // 400px desktop, max 320px mobile

  // Summary KPIs - Deal detection metrics with trend indicators
  // Reacts to: Location filters (district, bedroom, segment)
  // Ignores: Date range filters (always shows "current market" status)
  const [kpis, setKpis] = useState({
    medianPsf: { value: 0, trend: 0, insight: '' },
    predictability: { value: 0, trend: 0, label: 'Loading', insight: '' },
    newLaunchPremium: { value: 0, trendLabel: '', direction: 'neutral', insight: '' },
    buyerOpportunity: { value: 50, label: 'Loading', insight: '' },
    loading: true,
  });

  // Fetch KPIs based on current filters (but ignore date range - always use "current market")
  // - Cards 1, 2, 4: Last 30 days (pulse metrics)
  // - Card 3 (New Launch Premium): Full data (structural metric - needs data density)
  useEffect(() => {
    const fetchKpis = async () => {
      // Wait for apiMetadata to be loaded
      if (!apiMetadata?.max_date) {
        return;
      }

      try {
        // Calculate date ranges (ignore sidebar date range - always show current market)
        const maxDate = new Date(apiMetadata.max_date);
        const thirtyDaysAgo = new Date(maxDate);
        thirtyDaysAgo.setDate(maxDate.getDate() - 30);
        const sixtyDaysAgo = new Date(maxDate);
        sixtyDaysAgo.setDate(maxDate.getDate() - 60);

        const dateFrom = thirtyDaysAgo.toISOString().split('T')[0];
        const dateTo = maxDate.toISOString().split('T')[0];
        const prevDateFrom = sixtyDaysAgo.toISOString().split('T')[0];
        const prevDateTo = thirtyDaysAgo.toISOString().split('T')[0];

        // Build location/property filters (react to sidebar, but NOT date range)
        const locationFilters = {};
        if (filters.districts?.length > 0) {
          locationFilters.district = filters.districts.join(',');
        }
        if (filters.bedroomTypes?.length > 0) {
          locationFilters.bedroom = filters.bedroomTypes.join(',');
        }
        if (filters.segment) {
          locationFilters.segment = filters.segment;
        }

        // Fetch all metrics in parallel
        const [currentPsfRes, prevPsfRes, newVsResaleRes, histogramRes] = await Promise.all([
          // Current period PSF metrics (last 30 days)
          getAggregate({
            group_by: '',
            metrics: 'median_psf,psf_25th,psf_75th,count',
            date_from: dateFrom,
            date_to: dateTo,
            ...locationFilters,
          }),
          // Previous period PSF metrics (30-60 days ago) for trend
          getAggregate({
            group_by: '',
            metrics: 'median_psf,psf_25th,psf_75th,count',
            date_from: prevDateFrom,
            date_to: prevDateTo,
            ...locationFilters,
          }),
          // New vs Resale premium (full data for structural metric, but with location filters)
          getNewVsResale({
            timeGrain: 'quarter',
            ...locationFilters,
          }),
          // Price histogram for buyer opportunity calculation
          getDashboard({
            panels: 'price_histogram',
            date_from: dateFrom,
            date_to: dateTo,
            ...locationFilters,
          }),
        ]);

        // Extract data
        const currentPsf = currentPsfRes.data.data?.[0] || {};
        const prevPsf = prevPsfRes.data.data?.[0] || {};
        const newVsResaleSummary = newVsResaleRes.data?.summary || {};
        const histogram = histogramRes.data?.data?.price_histogram || {};

        // Calculate Median PSF with trend
        const medianPsfValue = currentPsf.median_psf || 0;
        const prevMedianPsf = prevPsf.median_psf || medianPsfValue;
        const medianPsfTrend = prevMedianPsf > 0
          ? ((medianPsfValue - prevMedianPsf) / prevMedianPsf) * 100
          : 0;

        // Calculate Price Predictability (IQR as % of median)
        // Sanity check: IQR ratio should typically be 15-50% for property markets
        const iqr = (currentPsf.psf_75th || 0) - (currentPsf.psf_25th || 0);
        let iqrRatio = medianPsfValue > 0 ? (iqr / medianPsfValue) * 100 : 0;
        // Cap at 100% - anything higher indicates a data issue
        if (iqrRatio > 100) {
          console.warn('Price Predictability ratio too high, capping at 100%', { iqr, medianPsfValue, psf_25th: currentPsf.psf_25th, psf_75th: currentPsf.psf_75th });
          iqrRatio = 100;
        }
        const prevIqr = (prevPsf.psf_75th || 0) - (prevPsf.psf_25th || 0);
        let prevIqrRatio = prevMedianPsf > 0 ? (prevIqr / prevMedianPsf) * 100 : iqrRatio;
        if (prevIqrRatio > 100) prevIqrRatio = 100;
        const predictabilityTrend = iqrRatio - prevIqrRatio;
        const predictabilityLabel = iqrRatio < 20 ? 'Very Stable'
          : iqrRatio < 30 ? 'Stable'
          : iqrRatio < 40 ? 'Moderate'
          : 'Volatile';

        // New Launch Premium
        const newLaunchPremium = newVsResaleSummary.currentPremium || 0;
        const premiumTrend = newVsResaleSummary.premiumTrend || 'stable';
        const premiumDirection = premiumTrend === 'widening' ? 'up'
          : premiumTrend === 'narrowing' ? 'down'
          : 'neutral';

        // Calculate Buyer Opportunity Score (based on price momentum)
        // Falling prices = buyer's market, Rising prices = seller's market
        // Score: 50 = balanced, >50 = buyer's market, <50 = seller's market
        let buyerOpportunityScore = 50 - (medianPsfTrend * 5); // -5% trend = 75 score (buyer's), +5% trend = 25 score (seller's)
        buyerOpportunityScore = Math.max(20, Math.min(80, buyerOpportunityScore)); // Cap between 20-80
        const buyerOpportunityLabel = buyerOpportunityScore >= 55 ? "Buyer's market"
          : buyerOpportunityScore <= 45 ? "Seller's market"
          : "Balanced";

        // Generate individual insights for each card
        const psfInsight = medianPsfTrend > 2 ? 'Rising - sellers have leverage'
          : medianPsfTrend < -2 ? 'Falling - buyers have leverage'
          : 'Stable pricing';

        const predictabilityInsight = iqrRatio > 40 ? 'Wide range - negotiate hard'
          : iqrRatio < 20 ? 'Tight range - be competitive'
          : 'Normal variance';

        const premiumInsight = newLaunchPremium > 20 ? 'High premium - consider resale'
          : newLaunchPremium < 10 && newLaunchPremium > 0 ? 'Low premium - new worth it'
          : 'Fair premium';

        const opportunityInsight = buyerOpportunityScore >= 55 ? 'Good time to buy'
          : buyerOpportunityScore <= 45 ? 'Good time to sell'
          : 'Market balanced';

        setKpis({
          medianPsf: {
            value: Math.round(medianPsfValue),
            trend: Number(medianPsfTrend.toFixed(1)),
            insight: psfInsight,
          },
          predictability: {
            value: Number(iqrRatio.toFixed(1)),
            trend: Number(predictabilityTrend.toFixed(1)),
            label: predictabilityLabel,
            insight: predictabilityInsight,
          },
          newLaunchPremium: {
            value: Number(newLaunchPremium.toFixed(1)),
            trendLabel: premiumTrend === 'stable' ? 'Stable' : premiumTrend.charAt(0).toUpperCase() + premiumTrend.slice(1),
            direction: premiumDirection,
            insight: premiumInsight,
          },
          buyerOpportunity: {
            value: Math.round(buyerOpportunityScore),
            label: buyerOpportunityLabel,
            insight: opportunityInsight,
          },
          loading: false,
        });
      } catch (err) {
        console.error('Error fetching KPIs:', err);
        setKpis(prev => ({ ...prev, loading: false }));
      }
    };
    fetchKpis();
  }, [apiMetadata?.max_date, filters.districts, filters.bedroomTypes, filters.segment]); // Re-fetch when data or location filters change

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
              <div className="flex items-center gap-3 flex-wrap">
                {/* Time Grouping Toggle - View context control (not a filter) */}
                <TimeGranularityToggle />

                {/* Highlight indicator (visual emphasis on time, no filtering) */}
                {highlight.value && (
                  <button
                    onClick={clearHighlight}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#213448]/10 text-[#213448] rounded-lg hover:bg-[#213448]/20 transition-colors text-sm border border-[#213448]/20"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>Viewing: {highlight.value}</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {/* Cross-filter indicator (actual data filtering) */}
                {crossFilter.value && (
                  <button
                    onClick={clearCrossFilter}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#547792]/20 text-[#213448] rounded-lg hover:bg-[#547792]/30 transition-colors text-sm"
                  >
                    <span>Filter: {crossFilter.value}</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              {/* KPI Summary Cards - Deal Detection Metrics (Last 30 Days) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
                {/* Card 1: Market Median PSF - Universal benchmark for deal assessment */}
                <KPICard
                  title="Market Median PSF"
                  subtitle={kpis.medianPsf.insight || 'past 30 days'}
                  value={`$${kpis.medianPsf.value.toLocaleString()}`}
                  loading={kpis.loading}
                  trend={{
                    value: Math.abs(kpis.medianPsf.trend),
                    direction: kpis.medianPsf.trend > 0.1 ? 'up' : kpis.medianPsf.trend < -0.1 ? 'down' : 'neutral',
                    label: 'vs prev 30d'
                  }}
                  icon={
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  }
                />
                {/* Card 2: Price Predictability - How tight/volatile is pricing */}
                <KPICard
                  title="Price Spread"
                  subtitle={kpis.predictability.insight || kpis.predictability.label}
                  value={kpis.predictability.label}
                  loading={kpis.loading}
                  trend={{
                    value: Math.abs(kpis.predictability.trend),
                    direction: kpis.predictability.trend < -0.1 ? 'up' : kpis.predictability.trend > 0.1 ? 'down' : 'neutral',
                    label: `${kpis.predictability.value}% IQR`
                  }}
                  icon={
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  }
                />
                {/* Card 3: New Launch Premium - Are new launches overpriced vs resale? */}
                <KPICard
                  title="New Launch Premium"
                  subtitle={kpis.newLaunchPremium.insight || 'vs resale'}
                  value={`${kpis.newLaunchPremium.value > 0 ? '+' : ''}${kpis.newLaunchPremium.value}%`}
                  loading={kpis.loading}
                  trend={kpis.newLaunchPremium.direction !== 'neutral' ? {
                    value: 0,
                    direction: kpis.newLaunchPremium.direction,
                    label: kpis.newLaunchPremium.trendLabel
                  } : undefined}
                  icon={
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  }
                />
                {/* Card 4: Market Momentum - Is market favoring buyers or sellers? */}
                <KPICard
                  title="Market Momentum"
                  subtitle={kpis.buyerOpportunity.insight || kpis.buyerOpportunity.label}
                  value={kpis.buyerOpportunity.label}
                  loading={kpis.loading}
                  trend={{
                    value: Math.abs(kpis.medianPsf.trend),
                    direction: kpis.medianPsf.trend < -0.1 ? 'up' : kpis.medianPsf.trend > 0.1 ? 'down' : 'neutral',
                    label: 'price trend'
                  }}
                  icon={
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  }
                />
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

                {/* Unit Size vs Price - Scatter chart showing value trade-offs */}
                <ErrorBoundary name="Unit Size vs Price" compact>
                  <UnitSizeVsPriceChart height={standardChartHeight} />
                </ErrorBoundary>

                {/* Price Distribution - Chart component unchanged */}
                <ErrorBoundary name="Price Distribution" compact>
                  <PriceDistributionChart
                    onDrillThrough={(value) => handleDrillThrough(`Transactions at ${value}`)}
                    height={standardChartHeight}
                  />
                </ErrorBoundary>

                {/* New Launch vs Resale Comparison - Full width */}
                <div className="lg:col-span-2">
                  <ErrorBoundary name="New vs Resale Chart" compact>
                    <NewVsResaleChart height={standardChartHeight} />
                  </ErrorBoundary>
                </div>

                {/* Price Compression Analysis - Full width, shows spread between market segments */}
                <div className="lg:col-span-2">
                  <ErrorBoundary name="Price Compression" compact>
                    <PriceCompressionChart height={compressionHeight} />
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

              {/* Transaction Data Table - Component unchanged */}
              <div className="mb-4 md:mb-6">
                <ErrorBoundary name="Transaction Table" compact>
                  <TransactionDataTable height={tableHeight} />
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
