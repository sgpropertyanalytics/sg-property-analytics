import React, { useState, useEffect } from 'react';
import { PowerBIFilterProvider, usePowerBIFilters } from '../context/PowerBIFilterContext';
import { TimeTrendChart } from '../components/powerbi/TimeTrendChart';
import { VolumeByLocationChart } from '../components/powerbi/VolumeByLocationChart';
import { PriceDistributionChart } from '../components/powerbi/PriceDistributionChart';
import { NewVsResaleChart } from '../components/powerbi/NewVsResaleChart';
import { TransactionDetailModal } from '../components/powerbi/TransactionDetailModal';
import { DrillBreadcrumb } from '../components/powerbi/DrillBreadcrumb';
import { TransactionDataTable } from '../components/powerbi/TransactionDataTable';
import { GLSDataTable } from '../components/powerbi/GLSDataTable';
import { NewLaunchDataTable } from '../components/powerbi/NewLaunchDataTable';
import { ProjectDetailPanel } from '../components/powerbi/ProjectDetailPanel';
import { getAggregate } from '../api/client';
import { useData } from '../context/DataContext';
// Standardized responsive UI components (layout wrappers only)
import { KPICard } from '../components/ui';

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
    crossFilter,
    highlight,
    clearCrossFilter,
    clearHighlight,
  } = usePowerBIFilters();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalFilters, setModalFilters] = useState({});

  // Summary KPIs - Last 30 days snapshot (ignores sidebar filters for market overview)
  const [kpis, setKpis] = useState({
    newSalesCount: 0,
    resalesCount: 0,
    totalQuantum: 0,
    loading: true,
  });

  // Fetch KPIs for last 30 days (based on data's max_date, not today)
  useEffect(() => {
    const fetchKpis = async () => {
      // Wait for apiMetadata to be loaded
      if (!apiMetadata?.max_date) {
        return;
      }

      try {
        // Calculate last 30 days from the database's max_date (not today)
        // This ensures KPIs show data even if the dataset doesn't extend to today
        const maxDate = new Date(apiMetadata.max_date);
        const thirtyDaysAgo = new Date(maxDate);
        thirtyDaysAgo.setDate(maxDate.getDate() - 30);

        const dateFrom = thirtyDaysAgo.toISOString().split('T')[0];
        const dateTo = maxDate.toISOString().split('T')[0];

        // Fetch New Sales and Resales in parallel
        const [newSalesRes, resalesRes] = await Promise.all([
          getAggregate({
            group_by: '',
            metrics: 'count,total_value',
            sale_type: 'New Sale',
            date_from: dateFrom,
            date_to: dateTo,
          }),
          getAggregate({
            group_by: '',
            metrics: 'count,total_value',
            sale_type: 'Resale',
            date_from: dateFrom,
            date_to: dateTo,
          }),
        ]);

        const newSalesData = newSalesRes.data.data?.[0] || {};
        const resalesData = resalesRes.data.data?.[0] || {};

        setKpis({
          newSalesCount: newSalesData.count || 0,
          resalesCount: resalesData.count || 0,
          totalQuantum: (newSalesData.total_value || 0) + (resalesData.total_value || 0),
          loading: false,
        });
      } catch (err) {
        console.error('Error fetching KPIs:', err);
        setKpis(prev => ({ ...prev, loading: false }));
      }
    };
    fetchKpis();
  }, [apiMetadata?.max_date]); // Re-fetch when max_date is available

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
              {/* KPI Summary Cards - Last 30 Days Market Snapshot */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
                <KPICard
                  title="Total New Sales"
                  subtitle="past 30 days"
                  value={kpis.newSalesCount.toLocaleString()}
                  loading={kpis.loading}
                  icon={
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  }
                />
                <KPICard
                  title="Total Resales"
                  subtitle="past 30 days"
                  value={kpis.resalesCount.toLocaleString()}
                  loading={kpis.loading}
                  icon={
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  }
                />
                <KPICard
                  title="Total Quantum Value"
                  subtitle="past 30 days"
                  value={kpis.totalQuantum >= 1000000000
                    ? `$${(kpis.totalQuantum / 1000000000).toFixed(2)}B`
                    : `$${(kpis.totalQuantum / 1000000).toFixed(0)}M`
                  }
                  loading={kpis.loading}
                  className="col-span-2 md:col-span-1"
                  icon={
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
              </div>

              {/* Charts Grid - Responsive: 1 col mobile, 2 cols desktop */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
                {/* Time Trend Chart - Full width on all screens */}
                <div className="lg:col-span-2">
                  {/* Chart component - DO NOT MODIFY PROPS (ui-freeze) */}
                  <TimeTrendChart
                    onDrillThrough={(value) => handleDrillThrough(`Transactions in ${value}`)}
                    height={280}
                  />
                </div>

                {/* Volume by Location - Chart component unchanged */}
                <VolumeByLocationChart
                  onDrillThrough={(value) => handleDrillThrough(`Transactions in ${value}`)}
                  height={350}
                  maxBars={12}
                />

                {/* Price Distribution - Chart component unchanged */}
                <PriceDistributionChart
                  onDrillThrough={(value) => handleDrillThrough(`Transactions at ${value}`)}
                  height={350}
                />

                {/* New Launch vs Resale Comparison - Full width */}
                <div className="lg:col-span-2">
                  <NewVsResaleChart height={350} />
                </div>
              </div>

              {/* GLS Data Table - Government Land Sales */}
              <div className="mb-4 md:mb-6">
                <GLSDataTable height={350} />
              </div>

              {/* Upcoming New Launches Table - Pre-launch projects (not yet launched) */}
              <div className="mb-4 md:mb-6">
                <NewLaunchDataTable height={350} />
              </div>

              {/* Transaction Data Table - Component unchanged */}
              <div className="mb-4 md:mb-6">
                <TransactionDataTable height={400} />
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
