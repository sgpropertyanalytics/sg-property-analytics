import React, { useState, useEffect } from 'react';
import { PowerBIFilterProvider, usePowerBIFilters } from '../context/PowerBIFilterContext';
import { PowerBIFilterSidebar } from '../components/powerbi/PowerBIFilterSidebar';
import { TimeTrendChart } from '../components/powerbi/TimeTrendChart';
import { VolumeByLocationChart } from '../components/powerbi/VolumeByLocationChart';
import { PriceDistributionChart } from '../components/powerbi/PriceDistributionChart';
import { BedroomMixChart } from '../components/powerbi/BedroomMixChart';
import { TransactionDetailModal } from '../components/powerbi/TransactionDetailModal';
import { DrillBreadcrumb } from '../components/powerbi/DrillBreadcrumb';
import { TransactionDataTable } from '../components/powerbi/TransactionDataTable';
import { getAggregate, getFilterOptions } from '../api/client';
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
    activeFilters,
    activeFilterCount,
    crossFilter,
    buildApiParams,
    clearCrossFilter,
  } = usePowerBIFilters();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalFilters, setModalFilters] = useState({});

  // Summary KPIs
  const [kpis, setKpis] = useState({
    totalTransactions: 0,
    medianPsf: 0,
    totalValue: 0,
    loading: true,
  });

  // Fetch KPIs when filters change
  useEffect(() => {
    const fetchKpis = async () => {
      try {
        const params = buildApiParams({
          group_by: '',
          metrics: 'count,median_psf,total_value,median_price'
        });
        const response = await getAggregate(params);
        const data = response.data.data?.[0] || {};
        setKpis({
          totalTransactions: data.count || 0,
          medianPsf: data.median_psf || 0,
          medianPrice: data.median_price || 0,
          totalValue: data.total_value || 0,
          loading: false,
        });
      } catch (err) {
        console.error('Error fetching KPIs:', err);
        setKpis(prev => ({ ...prev, loading: false }));
      }
    };
    fetchKpis();
  }, [buildApiParams]);

  const handleDrillThrough = (title, additionalFilters = {}) => {
    setModalTitle(title);
    setModalFilters(additionalFilters);
    setModalOpen(true);
  };

  return (
    <div className="flex h-screen bg-slate-100">
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
                <h1 className="text-2xl font-bold text-slate-800">Macro Overview</h1>
                <p className="text-slate-500 text-sm">
                  Power BI-style analytics with dynamic filtering
                </p>
              </div>
              {crossFilter.value && (
                <button
                  onClick={clearCrossFilter}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors text-sm"
                >
                  <span>Cross-filter: {crossFilter.value}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Data source info */}
            {apiMetadata && (
              <p className="text-xs text-slate-500 italic">
                Data source from URA | {apiMetadata.row_count?.toLocaleString() || '0'} records
                {apiMetadata.min_date && apiMetadata.max_date && (
                  <> from {new Date(apiMetadata.min_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short'
                  })} to {new Date(apiMetadata.max_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short'
                  })}
                  </>
                )}
              </p>
            )}

            {/* Breadcrumb navigation */}
            <DrillBreadcrumb />
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <KPICard
              title="Total Transactions"
              value={kpis.totalTransactions.toLocaleString()}
              loading={kpis.loading}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              onClick={() => handleDrillThrough('All Transactions')}
            />
            <KPICard
              title="Median PSF"
              value={`$${kpis.medianPsf.toLocaleString()}`}
              loading={kpis.loading}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <KPICard
              title="Median Price"
              value={`$${(kpis.medianPrice / 1000000).toFixed(2)}M`}
              loading={kpis.loading}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              }
            />
            <KPICard
              title="Total Value"
              value={`$${(kpis.totalValue / 1000000000).toFixed(2)}B`}
              loading={kpis.loading}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
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

            {/* Price Distribution */}
            <PriceDistributionChart
              onDrillThrough={(value) => handleDrillThrough(`Transactions at ${value}`)}
              height={350}
              bucketSize={200}
            />
          </div>

          {/* Second row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Bedroom Mix - 1 column */}
            <BedroomMixChart
              onDrillThrough={(value) => handleDrillThrough(`${value} Transactions`)}
              height={250}
            />

            {/* Quick Stats - 2 columns */}
            <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-800 mb-4">Quick Insights</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InsightCard
                  label="Avg Transaction Size"
                  value={kpis.totalTransactions > 0 ? `$${((kpis.totalValue / kpis.totalTransactions) / 1000000).toFixed(2)}M` : '-'}
                />
                <InsightCard
                  label="Active Filters"
                  value={activeFilterCount.toString()}
                  highlight={activeFilterCount > 0}
                />
                <InsightCard
                  label="Cross-filter"
                  value={crossFilter.value || 'None'}
                  highlight={!!crossFilter.value}
                />
                <InsightCard
                  label="Data Quality"
                  value="100%"
                />
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  <strong>Tips:</strong> Click on any chart element to cross-filter all charts.
                  Double-click to drill down into details. Use the sidebar filters for precise control.
                </p>
              </div>
            </div>
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
function KPICard({ title, value, loading, icon, onClick }) {
  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 p-4 ${
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-500 text-sm">{title}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      {loading ? (
        <div className="h-8 bg-slate-200 rounded animate-pulse"></div>
      ) : (
        <div className="text-2xl font-bold text-slate-800">{value}</div>
      )}
    </div>
  );
}

// Insight Card Component
function InsightCard({ label, value, highlight = false }) {
  return (
    <div className="text-center">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`font-semibold ${highlight ? 'text-blue-600' : 'text-slate-800'}`}>
        {value}
      </div>
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
