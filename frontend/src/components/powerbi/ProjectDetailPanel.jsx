import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { DISTRICT_NAMES } from '../../constants';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/**
 * Project Detail Panel - Drill-Through View
 *
 * Opens when a project is selected from VolumeByLocationChart.
 * Shows project-specific data (trend + price distribution).
 *
 * IMPORTANT: This component does NOT affect global charts.
 * It uses its own API queries filtered to the selected project only.
 */
export function ProjectDetailPanel() {
  const { selectedProject, clearSelectedProject, filters, highlight } = usePowerBIFilters();
  const [trendData, setTrendData] = useState([]);
  const [priceData, setPriceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Don't render if no project selected
  if (!selectedProject.name) {
    return null;
  }

  return (
    <ProjectDetailPanelInner
      selectedProject={selectedProject}
      clearSelectedProject={clearSelectedProject}
      filters={filters}
      highlight={highlight}
      trendData={trendData}
      setTrendData={setTrendData}
      priceData={priceData}
      setPriceData={setPriceData}
      loading={loading}
      setLoading={setLoading}
      error={error}
      setError={setError}
    />
  );
}

// Inner component to handle effects after we know project is selected
function ProjectDetailPanelInner({
  selectedProject,
  clearSelectedProject,
  filters,
  highlight,
  trendData,
  setTrendData,
  priceData,
  setPriceData,
  loading,
  setLoading,
  error,
  setError,
}) {
  // Fetch project-specific data
  useEffect(() => {
    const fetchProjectData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build params for project-specific queries
        // Note: We intentionally DON'T use buildApiParams from context
        // to ensure this query is independent and doesn't affect global state
        const baseParams = {
          project: selectedProject.name,
        };

        // Apply sidebar filters (but not highlight - this is project-specific view)
        if (filters.dateRange.start) baseParams.date_from = filters.dateRange.start;
        if (filters.dateRange.end) baseParams.date_to = filters.dateRange.end;
        if (filters.bedroomTypes.length > 0) {
          baseParams.bedroom = filters.bedroomTypes.join(',');
        }
        if (filters.saleType) baseParams.sale_type = filters.saleType;

        // Fetch trend data (monthly transactions)
        const trendParams = {
          ...baseParams,
          group_by: 'month',
          metrics: 'count,median_psf,avg_psf',
        };

        // Fetch price distribution (by bedroom)
        const priceParams = {
          ...baseParams,
          group_by: 'bedroom',
          metrics: 'count,median_psf,avg_psf,min_psf,max_psf',
        };

        const [trendResponse, priceResponse] = await Promise.all([
          getAggregate(trendParams),
          getAggregate(priceParams),
        ]);

        // Sort trend data by month
        const sortedTrend = (trendResponse.data.data || [])
          .filter(d => d.count > 0)
          .sort((a, b) => (a.month || '').localeCompare(b.month || ''));

        // Sort price data by bedroom
        const sortedPrice = (priceResponse.data.data || [])
          .filter(d => d.count > 0)
          .sort((a, b) => (a.bedroom || 0) - (b.bedroom || 0));

        setTrendData(sortedTrend);
        setPriceData(sortedPrice);
      } catch (err) {
        console.error('Error fetching project data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectData();
  }, [selectedProject.name, filters, setTrendData, setPriceData, setLoading, setError]);

  const districtName = selectedProject.district
    ? DISTRICT_NAMES[selectedProject.district] || selectedProject.district
    : null;

  // Chart data for trend
  const trendChartData = {
    labels: trendData.map(d => {
      const [year, month] = (d.month || '').split('-');
      const date = new Date(year, month - 1);
      return date.toLocaleDateString('en-SG', { month: 'short', year: '2-digit' });
    }),
    datasets: [
      {
        label: 'Median PSF',
        data: trendData.map(d => d.median_psf || 0),
        borderColor: 'rgba(84, 119, 146, 1)',
        backgroundColor: 'rgba(84, 119, 146, 0.1)',
        fill: true,
        tension: 0.3,
        yAxisID: 'y',
      },
      {
        label: 'Transaction Count',
        data: trendData.map(d => d.count || 0),
        borderColor: 'rgba(33, 52, 72, 0.8)',
        backgroundColor: 'rgba(33, 52, 72, 0.1)',
        fill: false,
        tension: 0.3,
        yAxisID: 'y1',
        borderDash: [5, 5],
      },
    ],
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          boxWidth: 6,
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label;
            const value = context.parsed.y;
            if (label === 'Median PSF') {
              return `${label}: $${value.toLocaleString()}`;
            }
            return `${label}: ${value.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Median PSF ($)' },
        ticks: {
          callback: (value) => `$${value.toLocaleString()}`,
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Transactions' },
        grid: { drawOnChartArea: false },
      },
    },
  };

  // Chart data for bedroom breakdown
  const bedroomChartData = {
    labels: priceData.map(d => `${d.bedroom}-BR`),
    datasets: [
      {
        label: 'Median PSF',
        data: priceData.map(d => d.median_psf || 0),
        backgroundColor: 'rgba(84, 119, 146, 0.8)',
        borderColor: 'rgba(84, 119, 146, 1)',
        borderWidth: 1,
      },
    ],
  };

  const bedroomChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const item = priceData[context.dataIndex];
            return [
              `Median PSF: $${item.median_psf?.toLocaleString() || 0}`,
              `Transactions: ${item.count?.toLocaleString() || 0}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Median PSF ($)' },
        ticks: {
          callback: (value) => `$${value.toLocaleString()}`,
        },
      },
    },
  };

  // Calculate summary stats
  const totalTransactions = priceData.reduce((sum, d) => sum + (d.count || 0), 0);
  const overallMedianPsf = priceData.length > 0
    ? Math.round(priceData.reduce((sum, d) => sum + (d.median_psf || 0) * (d.count || 0), 0) / totalTransactions)
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#94B4C1]/30 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#213448]">
              {selectedProject.name}
            </h2>
            {districtName && (
              <p className="text-sm text-[#547792] mt-1">
                {selectedProject.district} - {districtName.split(',')[0]}
              </p>
            )}
          </div>
          <button
            onClick={clearSelectedProject}
            className="p-2 hover:bg-[#EAE0CF] rounded-lg transition-colors"
            title="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#547792]">
              <path d="M15 5L5 15" />
              <path d="M5 5l10 10" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-[#547792]">Loading project data...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-red-500">Error: {error}</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
                  <p className="text-sm text-[#547792]">Total Transactions</p>
                  <p className="text-2xl font-semibold text-[#213448]">
                    {totalTransactions.toLocaleString()}
                  </p>
                </div>
                <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
                  <p className="text-sm text-[#547792]">Overall Median PSF</p>
                  <p className="text-2xl font-semibold text-[#213448]">
                    ${overallMedianPsf.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Trend Chart */}
              <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4">
                <h3 className="font-semibold text-[#213448] mb-4">Price Trend Over Time</h3>
                <div style={{ height: 250 }}>
                  {trendData.length > 0 ? (
                    <Line data={trendChartData} options={trendChartOptions} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-[#547792]">
                      No trend data available
                    </div>
                  )}
                </div>
              </div>

              {/* Bedroom Breakdown */}
              <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4">
                <h3 className="font-semibold text-[#213448] mb-4">Price by Bedroom Type</h3>
                <div style={{ height: 200 }}>
                  {priceData.length > 0 ? (
                    <Bar data={bedroomChartData} options={bedroomChartOptions} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-[#547792]">
                      No bedroom data available
                    </div>
                  )}
                </div>
              </div>

              {/* Info Note */}
              <p className="text-xs text-[#547792] text-center">
                This view shows data specific to {selectedProject.name}.
                Other dashboard charts are not affected by this selection.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectDetailPanel;
