import React, { useEffect, useState, useRef } from 'react';
// Chart.js components registered globally in chartSetup.js
import { Line, Bar } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilter';
import { getAggregate, getProjectInventory, getDashboard } from '../../api/client';
import { DISTRICT_NAMES } from '../../constants';
import {
  getAggField,
  AggField,
  ProjectInventoryField,
  getProjectInventoryField,
} from '../../schemas/apiContract';
import { SuppressedValue } from '../SuppressedValue';
import { CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';
import { ErrorState } from '../common/ErrorState';
import { getQueryErrorMessage } from '../common/QueryState';

// K-anonymity threshold for project-level data
const K_PROJECT_THRESHOLD = 15;

/**
 * Project Detail Panel - Drill-Through View
 *
 * Opens when a project is selected from a chart or table.
 * Shows project-specific data (trend + price distribution).
 *
 * IMPORTANT: This component does NOT affect global charts.
 * It uses its own API queries filtered to the selected project only.
 */
export function ProjectDetailPanel() {
  const { selectedProject, clearSelectedProject, filters } = usePowerBIFilters();
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
  trendData,
  setTrendData,
  priceData,
  setPriceData,
  loading,
  setLoading,
  error,
  setError,
}) {
  // State for cumulative sales by sale type
  const [salesByType, setSalesByType] = useState({ newSale: 0, resale: 0 });
  // State for inventory data (total units, unsold estimation)
  const [inventoryData, setInventoryData] = useState(null);
  // State for price histogram data
  const [histogramData, setHistogramData] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Request tracking for stale request prevention
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  // Fetch project-specific data
  useEffect(() => {
    // Abort previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Increment request ID for stale detection
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    const fetchProjectData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build params for project-specific queries
        // Note: We intentionally DON'T use buildApiParams from context
        // to ensure this query is independent and doesn't affect global state
        // IMPORTANT: Use project_exact for EXACT match (not partial LIKE match)
        // This ensures we only get data for this specific project, not similar-named projects
        const baseParams = {
          project_exact: selectedProject.name,
        };

        // Apply sidebar filters for trend/price views (but not highlight)
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
          metrics: 'count,median_psf,avg_psf,min_psf,max_psf,median_price,price_25th,price_75th',
        };

        // Build histogram params for project-specific price distribution
        // IMPORTANT: Use project_exact for EXACT match (not partial LIKE match)
        const histogramParams = {
          project_exact: selectedProject.name,
          panels: 'price_histogram',
          histogram_bins: 20,
        };
        // Apply date filters to histogram as well
        if (filters.dateRange.start) histogramParams.date_from = filters.dateRange.start;
        if (filters.dateRange.end) histogramParams.date_to = filters.dateRange.end;
        if (filters.bedroomTypes.length > 0) {
          histogramParams.bedroom = filters.bedroomTypes.join(',');
        }
        if (filters.saleType) histogramParams.sale_type = filters.saleType;

        // Fetch all data in parallel, including inventory and histogram
        const [trendResponse, priceResponse, inventoryResponse, histogramResponse] = await Promise.all([
          getAggregate(trendParams, { signal }),
          getAggregate(priceParams, { signal }),
          getProjectInventory(selectedProject.name, { signal }),
          getDashboard(histogramParams, { signal }),
        ]);

        // Ignore stale responses - a newer request has started
        if (requestId !== requestIdRef.current) return;

        // Sort trend data by month (use getAggField for contract-safe access)
        const sortedTrend = (trendResponse.data || [])
          .filter(d => getAggField(d, AggField.COUNT) > 0)
          .sort((a, b) => (a.month || '').localeCompare(b.month || ''));

        // Sort price data by bedroom (use getAggField for contract-safe access)
        const sortedPrice = (priceResponse.data || [])
          .filter(d => getAggField(d, AggField.COUNT) > 0)
          .sort((a, b) => (getAggField(a, AggField.BEDROOM_COUNT) || 0) - (getAggField(b, AggField.BEDROOM_COUNT) || 0));

        // Extract inventory data (includes cumulative sales from backend)
        const inventory = inventoryResponse.data || {};
        setSalesByType({
          newSale: getProjectInventoryField(inventory, ProjectInventoryField.CUMULATIVE_NEW_SALES) || 0,
          resale: getProjectInventoryField(inventory, ProjectInventoryField.CUMULATIVE_RESALES) || 0
        });
        setInventoryData(inventory);

        // Extract histogram data
        const histData = histogramResponse.data?.price_histogram || [];
        setHistogramData(histData);

        setTrendData(sortedTrend);
        setPriceData(sortedPrice);
      } catch (err) {
        // Ignore abort errors - expected when request is cancelled
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        // Ignore errors from stale requests
        if (requestId !== requestIdRef.current) return;
        console.error('Error fetching project data:', err);
        setError(err);
      } finally {
        // Only clear loading for the current request
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    fetchProjectData();

    // Cleanup: abort on unmount or when dependencies change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [selectedProject.name, filters, refreshKey, setTrendData, setPriceData, setLoading, setError]);

  const districtName = selectedProject.district
    ? DISTRICT_NAMES[selectedProject.district] || selectedProject.district
    : null;

  // Chart data for trend (use getAggField for contract-safe access)
  const trendChartData = {
    labels: trendData.map(d => {
      const [year, month] = (d.month || '').split('-');
      const date = new Date(year, month - 1);
      return date.toLocaleDateString('en-SG', { month: 'short', year: '2-digit' });
    }),
    datasets: [
      {
        label: 'Median PSF',
        data: trendData.map(d => getAggField(d, AggField.MEDIAN_PSF) || 0),
        borderColor: 'rgba(84, 119, 146, 1)',
        backgroundColor: 'rgba(84, 119, 146, 0.1)',
        fill: true,
        tension: 0.3,
        yAxisID: 'y',
      },
      {
        label: 'Observations',
        data: trendData.map(d => getAggField(d, AggField.COUNT) || 0),
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
        ticks: CHART_AXIS_DEFAULTS.ticks,
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Median PSF ($)', ...CHART_AXIS_DEFAULTS.title },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => `$${value.toLocaleString()}`,
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Observations', ...CHART_AXIS_DEFAULTS.title },
        ticks: CHART_AXIS_DEFAULTS.ticks,
        grid: { drawOnChartArea: false },
      },
    },
  };

  // Chart data for bedroom breakdown (use getAggField for contract-safe access)
  const bedroomChartData = {
    labels: priceData.map(d => {
      const bedroom = getAggField(d, AggField.BEDROOM_COUNT);
      return bedroom >= 5 ? '5BR' : `${bedroom}BR`;
    }),
    datasets: [
      {
        label: 'Median PSF',
        data: priceData.map(d => getAggField(d, AggField.MEDIAN_PSF) || 0),
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
            const formatPrice = (val) => val ? `$${(val / 1000000).toFixed(2)}M` : 'N/A';
            const medianPsf = getAggField(item, AggField.MEDIAN_PSF);
            const price25th = getAggField(item, AggField.PRICE_25TH);
            const medianPrice = getAggField(item, AggField.MEDIAN_PRICE);
            const price75th = getAggField(item, AggField.PRICE_75TH);
            const count = getAggField(item, AggField.COUNT);
            return [
              `Median PSF: $${medianPsf?.toLocaleString() || 0}`,
              `25th %: ${formatPrice(price25th)}`,
              `Median: ${formatPrice(medianPrice)}`,
              `75th %: ${formatPrice(price75th)}`,
              `Units Sold: ${count?.toLocaleString() || 0}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: CHART_AXIS_DEFAULTS.ticks,
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Median PSF ($)', ...CHART_AXIS_DEFAULTS.title },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => `$${value.toLocaleString()}`,
        },
      },
    },
  };

  // Calculate summary stats (use getAggField for contract-safe access)
  const totalTransactions = priceData.reduce((sum, d) => sum + (getAggField(d, AggField.COUNT) || 0), 0);
  const overallMedianPsf = priceData.length > 0
    ? Math.round(priceData.reduce((sum, d) => sum + (getAggField(d, AggField.MEDIAN_PSF) || 0) * (getAggField(d, AggField.COUNT) || 0), 0) / totalTransactions)
    : 0;

  // Helper to format price labels (e.g., $1.2M, $800K)
  const formatPriceLabel = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  // Process histogram data for chart
  const histogramBuckets = histogramData.map(h => ({
    start: h.bin_start,
    end: h.bin_end,
    label: `${formatPriceLabel(h.bin_start)}-${formatPriceLabel(h.bin_end)}`,
    count: h.count
  }));

  const histogramCounts = histogramBuckets.map(b => b.count);
  const histogramTotal = histogramCounts.reduce((sum, c) => sum + c, 0);
  const histogramMaxCount = Math.max(...histogramCounts, 1);
  const histogramModeIndex = histogramCounts.length > 0 ? histogramCounts.indexOf(histogramMaxCount) : -1;
  const histogramModeBucket = histogramModeIndex >= 0 ? histogramBuckets[histogramModeIndex] : null;
  const histogramMinPrice = histogramBuckets.length > 0 ? histogramBuckets[0].start : 0;
  const histogramMaxPrice = histogramBuckets.length > 0 ? histogramBuckets[histogramBuckets.length - 1].end : 0;
  const histogramBucketSize = histogramBuckets.length > 0 ? (histogramBuckets[0].end - histogramBuckets[0].start) : 0;

  // Color gradient for histogram bars
  const getHistogramBarColor = (count, alpha = 0.8) => {
    const intensity = 0.3 + (count / histogramMaxCount) * 0.7;
    return `rgba(84, 119, 146, ${alpha * intensity})`;  // #547792
  };

  const histogramChartData = {
    labels: histogramBuckets.map(b => b.label),
    datasets: [
      {
        label: 'Observation Count',
        data: histogramCounts,
        backgroundColor: histogramCounts.map(c => getHistogramBarColor(c)),
        borderColor: histogramCounts.map(c => getHistogramBarColor(c, 1)),
        borderWidth: 1,
      },
    ],
  };

  const histogramChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const bucket = histogramBuckets[items[0].dataIndex];
            return `Price: ${formatPriceLabel(bucket.start)} - ${formatPriceLabel(bucket.end)}`;
          },
          label: (context) => {
            const count = context.parsed.y;
            const pct = histogramTotal > 0 ? ((count / histogramTotal) * 100).toFixed(1) : 0;
            return [`Observations: ${count.toLocaleString()}`, `Share: ${pct}%`];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Observation Count', ...CHART_AXIS_DEFAULTS.title },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => value.toLocaleString(),
        },
      },
    },
  };

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
              <div className="w-full max-w-md">
                <ErrorState
                  message={getQueryErrorMessage(error)}
                  onRetry={() => setRefreshKey((prev) => prev + 1)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Inventory Stats - Show when total units available */}
              {inventoryData?.total_units ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <p className="text-sm text-green-700">Total Units</p>
                      <p className="text-2xl font-semibold text-green-800">
                        {inventoryData.total_units.toLocaleString()}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        Source: {inventoryData.data_source}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700">Sold (New Sale)</p>
                      <p className="text-2xl font-semibold text-green-800">
                        {salesByType.newSale.toLocaleString()}
                      </p>
                      <p className="text-xs text-green-600 mt-1">Developer sales</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700">% Sold</p>
                      <p className="text-2xl font-semibold text-green-800">
                        {inventoryData.percent_sold ?? 'N/A'}%
                      </p>
                      <p className="text-xs text-green-600 mt-1">New Sales / Total</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700">Est. Unsold</p>
                      <p className="text-2xl font-semibold text-green-800">
                        {inventoryData.estimated_unsold?.toLocaleString() || 'N/A'}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        {inventoryData.confidence === 'high' ? 'High confidence' : 'Medium confidence'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700">Resales</p>
                      <p className="text-2xl font-semibold text-green-800">
                        {salesByType.resale.toLocaleString()}
                      </p>
                      <p className="text-xs text-green-600 mt-1">Secondary market</p>
                    </div>
                  </div>
                  <p className="text-xs text-green-600 mt-3 text-center">
                    {inventoryData.disclaimer}
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary Stats - Fallback when no inventory data */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
                      <p className="text-sm text-[#547792]">Cumulative New Sales</p>
                      <p className="text-2xl font-semibold text-[#213448]">
                        {salesByType.newSale.toLocaleString()}
                      </p>
                      <p className="text-xs text-[#547792] mt-1">Units sold by developer</p>
                    </div>
                    <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
                      <p className="text-sm text-[#547792]">Cumulative Resales</p>
                      <p className="text-2xl font-semibold text-[#213448]">
                        {salesByType.resale.toLocaleString()}
                      </p>
                      <p className="text-xs text-[#547792] mt-1">Secondary market</p>
                    </div>
                    <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
                      <p className="text-sm text-[#547792]">Total Observations</p>
                      <p className="text-2xl font-semibold text-[#213448]">
                        {(salesByType.newSale + salesByType.resale).toLocaleString()}
                      </p>
                      <p className="text-xs text-[#547792] mt-1">All time</p>
                    </div>
                    <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
                      <p className="text-sm text-[#547792]">Median PSF</p>
                      <p className="text-2xl font-semibold text-[#213448]">
                        ${overallMedianPsf.toLocaleString()}
                      </p>
                      <p className="text-xs text-[#547792] mt-1">Current filter</p>
                    </div>
                  </div>

                  {/* Inventory Data Not Available Note */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs text-gray-600">
                      <strong>Note:</strong> Total units data not available for this project.
                      Unsold inventory cannot be calculated without total project units from URA/PropertyGuru/EdgeProp.
                    </p>
                  </div>
                </>
              )}

              {/* Trend Chart */}
              <div className="bg-card rounded-lg border border-[#94B4C1]/50 p-4">
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
              <div className="bg-card rounded-lg border border-[#94B4C1]/50 p-4">
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
                {/* Price Stats Table by Bedroom */}
                {priceData.length > 0 && (
                  <div className="mt-4 border-t border-[#94B4C1]/30 pt-3">
                    <h4 className="text-xs font-medium text-[#547792] mb-2">Price Statistics by Bedroom</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[#547792] border-b border-[#94B4C1]/30">
                            <th className="text-left py-1 pr-2">Type</th>
                            <th className="text-right py-1 px-1">Units</th>
                            <th className="text-right py-1 px-1">25th %</th>
                            <th className="text-right py-1 px-1">Median</th>
                            <th className="text-right py-1 pl-1">75th %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {priceData.map((d) => {
                            const bedroom = getAggField(d, AggField.BEDROOM_COUNT);
                            const count = getAggField(d, AggField.COUNT) || 0;
                            const price25th = getAggField(d, AggField.PRICE_25TH);
                            const medianPrice = getAggField(d, AggField.MEDIAN_PRICE);
                            const price75th = getAggField(d, AggField.PRICE_75TH);
                            const isSuppressed = count < K_PROJECT_THRESHOLD;
                            const formatPrice = (v) => v ? `$${(v / 1000000).toFixed(2)}M` : '-';
                            return (
                              <tr key={bedroom} className={`border-b border-[#94B4C1]/20 ${isSuppressed ? 'opacity-60' : 'hover:bg-[#EAE0CF]/20'}`}>
                                <td className="py-1.5 pr-2 font-medium text-[#213448]">{bedroom >= 5 ? '5BR' : `${bedroom}BR`}</td>
                                <td className="py-1.5 px-1 text-right text-[#547792]">{count.toLocaleString()}</td>
                                <td className="py-1.5 px-1 text-right text-[#547792]">
                                  <SuppressedValue value={price25th} suppressed={isSuppressed} kRequired={K_PROJECT_THRESHOLD} formatter={formatPrice} />
                                </td>
                                <td className="py-1.5 px-1 text-right font-medium text-[#213448]">
                                  <SuppressedValue value={medianPrice} suppressed={isSuppressed} kRequired={K_PROJECT_THRESHOLD} formatter={formatPrice} />
                                </td>
                                <td className="py-1.5 pl-1 text-right text-[#547792]">
                                  <SuppressedValue value={price75th} suppressed={isSuppressed} kRequired={K_PROJECT_THRESHOLD} formatter={formatPrice} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Price Distribution Histogram */}
              <div className="bg-card rounded-lg border border-[#94B4C1]/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[#213448]">Price Distribution</h3>
                  {histogramModeBucket && (
                    <span className="text-xs text-[#213448]">Mode: {histogramModeBucket.label}</span>
                  )}
                </div>
                {histogramBuckets.length > 0 && (
                  <p className="text-xs text-[#547792] mb-3">
                    {formatPriceLabel(histogramMinPrice)} - {formatPriceLabel(histogramMaxPrice)} ({histogramBuckets.length} bins @ {formatPriceLabel(histogramBucketSize)})
                  </p>
                )}
                <div style={{ height: 200 }}>
                  {histogramBuckets.length > 0 ? (
                    <Bar data={histogramChartData} options={histogramChartOptions} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-[#547792]">
                      No price distribution data available
                    </div>
                  )}
                </div>
                {histogramTotal > 0 && (
                  <p className="text-xs text-[#547792] mt-2 text-center">
                    Total: {histogramTotal.toLocaleString()} observations
                  </p>
                )}
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
