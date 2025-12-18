import React, { useState, useEffect } from 'react';
import { PowerBIFilterProvider, usePowerBIFilters } from '../context/PowerBIFilterContext';
import { PowerBIFilterSidebar } from '../components/powerbi/PowerBIFilterSidebar';
import { TimeTrendChart } from '../components/powerbi/TimeTrendChart';
import { VolumeByLocationChart } from '../components/powerbi/VolumeByLocationChart';
import { PriceDistributionChart } from '../components/powerbi/PriceDistributionChart';
import { TransactionDetailModal } from '../components/powerbi/TransactionDetailModal';
import { DrillBreadcrumb } from '../components/powerbi/DrillBreadcrumb';
import { TransactionDataTable } from '../components/powerbi/TransactionDataTable';
import { getAggregate } from '../api/client';
import { useData } from '../context/DataContext';

/**
 * Macro Overview Page - Power BI-style Dashboard
 *
 * Features:
 * - Dynamic filtering with sidebar controls
 * - Cross-filtering (click chart to filter others)
 * - Drill-down hierarchies (time: year/quarter/month, location: region/district/project)
 * - Drill-through to transaction details
 */
function MacroOverviewContent() {
  const { apiMetadata } = useData();
  const {
    crossFilter,
    highlight,
    clearCrossFilter,
    clearHighlight,
  } = usePowerBIFilters();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  // Fetch KPIs for last 30 days (fixed time window, not affected by sidebar filters)
  useEffect(() => {
    const fetchKpis = async () => {
      try {
        // Calculate last 30 days from today
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);

        const dateFrom = thirtyDaysAgo.toISOString().split('T')[0];
        const dateTo = today.toISOString().split('T')[0];

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
  }, []); // Only fetch once on mount - these are market snapshot KPIs

  const handleDrillThrough = (title, additionalFilters = {}) => {
    setModalTitle(title);
    setModalFilters(additionalFilters);
    setModalOpen(true);
  };

  return (
    <div className="flex h-screen bg-[#EAE0CF]/30">
      {/* Filter Sidebar */}
      <PowerBIFilterSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-2xl font-bold text-[#213448]">Singapore Property Market Analytics</h1>
                {/* Data source info - shows raw database count and date range */}
                {apiMetadata && (
                  <p className="text-[#547792] text-sm italic">
                    Data source from URA (Total of {((apiMetadata.row_count || 0) + (apiMetadata.total_records_removed || apiMetadata.outliers_excluded || 0)).toLocaleString()} transaction records
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
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
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

          {/* KPI Summary Cards - Last 30 Days Market Snapshot */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <KPICard
              title="Total New Sales"
              subtitle="past 30 days"
              value={kpis.newSalesCount.toLocaleString()}
              loading={kpis.loading}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
            <KPICard
              title="Total Quantum Value"
              subtitle="past 30 days"
              value={`$${(kpis.totalQuantum / 1000000000).toFixed(2)}B`}
              loading={kpis.loading}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Time Trend Chart - Full width */}
            <div className="lg:col-span-2">
              <TimeTrendChart
                onDrillThrough={(value) => handleDrillThrough(`Transactions in ${value}`)}
                height={280}
              />
            </div>

            {/* Volume by Location */}
            <VolumeByLocationChart
              onDrillThrough={(value) => handleDrillThrough(`Transactions in ${value}`)}
              height={350}
              maxBars={12}
            />

            {/* Price Distribution - 20 bins with dynamic intervals */}
            <PriceDistributionChart
              onDrillThrough={(value) => handleDrillThrough(`Transactions at ${value}`)}
              height={350}
            />
          </div>

          {/* Transaction Data Table */}
          <div className="mb-6">
            <TransactionDataTable height={400} />
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
    </div>
  );
}

// KPI Card Component
function KPICard({ title, subtitle, value, loading, icon, onClick }) {
  return (
    <div
      className={`bg-white rounded-lg border border-[#94B4C1]/50 p-4 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-[#547792] transition-all' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[#547792] text-sm">{title}</span>
          {subtitle && (
            <span className="text-[#94B4C1] text-xs italic ml-2">{subtitle}</span>
          )}
        </div>
        <span className="text-[#94B4C1]">{icon}</span>
      </div>
      {loading ? (
        <div className="h-8 bg-[#94B4C1]/30 rounded animate-pulse"></div>
      ) : (
        <div className="text-2xl font-bold text-[#213448]">{value}</div>
      )}
    </div>
  );
}


// Export wrapped with provider
export default function MacroOverview() {
  return (
    <PowerBIFilterProvider>
      <MacroOverviewContent />
    </PowerBIFilterProvider>
  );
}
