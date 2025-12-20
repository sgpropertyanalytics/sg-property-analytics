import React, { useState, useCallback, useEffect } from 'react';
import { getTransactionsList, getFilterOptions } from '../api/client';
import { DISTRICT_NAMES } from '../constants';

/**
 * ValueParityPanel - Budget-based property search tool
 *
 * Features:
 * - Budget input (required)
 * - Optional filters: Bedroom, Region (CCR/RCR/OCR), District
 * - Shows transactions where price <= budget
 * - Reuses same table structure as TransactionDataTable
 */
// Budget slider constants
const BUDGET_MIN = 500000;    // $500K
const BUDGET_MAX = 8000000;   // $8M
const BUDGET_STEP = 25000;    // $25K intervals

export function ValueParityPanel() {
  // Form state - budget as number for slider
  const [budget, setBudget] = useState(1500000); // Default $1.5M
  const [bedroom, setBedroom] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Filter options from API
  const [filterOptions, setFilterOptions] = useState({
    districts: [],
    loading: true,
  });

  // Table state
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    totalRecords: 0,
    totalPages: 0,
  });
  const [sortConfig, setSortConfig] = useState({
    column: 'price',
    order: 'desc',
  });

  // Load filter options on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const response = await getFilterOptions();
        setFilterOptions({
          districts: response.data.districts || [],
          loading: false,
        });
      } catch (err) {
        console.error('Error loading filter options:', err);
        setFilterOptions(prev => ({ ...prev, loading: false }));
      }
    };
    loadFilterOptions();
  }, []);

  // Fetch transactions based on budget and filters
  const fetchTransactions = useCallback(async (page = 1) => {
    if (!budget || budget <= 0) {
      setError('Please select a valid budget');
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const params = {
        page,
        limit: pagination.limit,
        sort_by: sortConfig.column,
        sort_order: sortConfig.order,
        price_max: budget,
      };

      // Add optional filters
      if (bedroom) {
        params.bedroom = bedroom;
      }
      if (region) {
        params.segment = region;
      }
      if (district) {
        params.district = district;
      }

      const response = await getTransactionsList(params);
      setData(response.data.transactions || []);
      setPagination(prev => ({
        ...prev,
        page,
        totalRecords: response.data.pagination?.total_records || 0,
        totalPages: response.data.pagination?.total_pages || 0,
      }));
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [budget, bedroom, region, district, pagination.limit, sortConfig]);

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchTransactions(1);
  };

  // Handle sort
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Re-fetch when sort changes (if we have searched)
  useEffect(() => {
    if (hasSearched && budget) {
      fetchTransactions(1);
    }
  }, [sortConfig]);

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchTransactions(newPage);
    }
  };

  // Format budget for display
  const formatBudgetDisplay = (value) => {
    if (value >= 1000000) {
      const millions = value / 1000000;
      return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  // Format date - show only month and year
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'short',
    });
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    return `$${value.toLocaleString()}`;
  };

  // Sort indicator
  const SortIcon = ({ column }) => {
    if (sortConfig.column !== column) {
      return (
        <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortConfig.order === 'asc' ? (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Column definitions
  const columns = [
    { key: 'transaction_date', label: 'Month', sortable: true, width: 'w-20' },
    { key: 'project_name', label: 'Project', sortable: true, width: 'w-48' },
    { key: 'district', label: 'District', sortable: true, width: 'w-16' },
    { key: 'bedroom_count', label: 'BR', sortable: true, width: 'w-12' },
    { key: 'area_sqft', label: 'Area (sqft)', sortable: true, width: 'w-24', align: 'right' },
    { key: 'price', label: 'Price', sortable: true, width: 'w-28', align: 'right' },
    { key: 'psf', label: 'PSF', sortable: true, width: 'w-20', align: 'right' },
    { key: 'sale_type', label: 'Type', sortable: true, width: 'w-20' },
  ];

  // Filter districts by selected region
  const filteredDistricts = filterOptions.districts.filter(d => {
    if (!region) return true;
    // CCR: D01, D02, D06, D09, D10, D11
    // RCR: D03, D04, D05, D07, D08, D12, D13, D14, D15
    // OCR: D16, D17, D18, D19, D20, D21, D22, D23, D24, D25, D26, D27, D28
    const ccrDistricts = ['D01', 'D02', 'D06', 'D09', 'D10', 'D11'];
    const rcrDistricts = ['D03', 'D04', 'D05', 'D07', 'D08', 'D12', 'D13', 'D14', 'D15'];

    if (region === 'CCR') return ccrDistricts.includes(d);
    if (region === 'RCR') return rcrDistricts.includes(d);
    if (region === 'OCR') return !ccrDistricts.includes(d) && !rcrDistricts.includes(d);
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Input Panel */}
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4 md:p-6">
        <p className="text-sm text-[#547792] mb-4">Benchmark realized transaction prices across your target budget</p>

        <form onSubmit={handleSearch}>
          {/* Desktop: 6 columns - Slider(2) + Bedroom(1) + Region(1) + District(1) + Search(1) */}
          {/* Tablet/Mobile: Stack appropriately */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 lg:gap-4 items-end">
            {/* Budget Slider - spans 2 columns on all breakpoints */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#547792]">
                  Budget (SGD)
                </label>
                <span className="text-lg font-bold text-[#213448]">
                  {formatBudgetDisplay(budget)}
                </span>
              </div>
              <div className="relative pt-1">
                <input
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={BUDGET_STEP}
                  value={budget}
                  onChange={(e) => setBudget(parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-thumb"
                />
                <div className="flex justify-between text-xs text-[#547792] mt-1.5 font-medium">
                  <span>$500K</span>
                  <span>$1M</span>
                  <span>$2M</span>
                  <span>$3M</span>
                  <span>$4M</span>
                  <span>$5M</span>
                  <span>$6M</span>
                  <span>$8M</span>
                </div>
              </div>
            </div>

            {/* Bedroom Dropdown - Optional */}
            <div>
              <label className="block text-xs font-medium text-[#547792] mb-1.5">
                Bedroom
              </label>
              <select
                value={bedroom}
                onChange={(e) => setBedroom(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[#94B4C1] rounded-md focus:outline-none focus:ring-2 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-white"
              >
                <option value="">All</option>
                <option value="1">1B</option>
                <option value="2">2B</option>
                <option value="3">3B</option>
                <option value="4">4B+</option>
              </select>
            </div>

            {/* Region Dropdown - Optional */}
            <div>
              <label className="block text-xs font-medium text-[#547792] mb-1.5">
                Region
              </label>
              <select
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  setDistrict(''); // Reset district when region changes
                }}
                className="w-full px-3 py-2.5 text-sm border border-[#94B4C1] rounded-md focus:outline-none focus:ring-2 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-white"
              >
                <option value="">All</option>
                <option value="CCR">CCR (Core Central)</option>
                <option value="RCR">RCR (Rest of Central)</option>
                <option value="OCR">OCR (Outside Central)</option>
              </select>
            </div>

            {/* District Dropdown - Optional */}
            <div>
              <label className="block text-xs font-medium text-[#547792] mb-1.5">
                District
              </label>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[#94B4C1] rounded-md focus:outline-none focus:ring-2 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-white"
                disabled={filterOptions.loading}
              >
                <option value="">All</option>
                {filteredDistricts.map(d => {
                  const areaName = DISTRICT_NAMES[d];
                  const shortName = areaName ? areaName.split(',')[0].substring(0, 18) : d;
                  return (
                    <option key={d} value={d}>
                      {d}{areaName ? ` (${shortName})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Search Button */}
            <div>
              <label className="block text-xs font-medium text-[#547792] mb-1.5 invisible">Search</label>
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2.5 bg-[#213448] text-white text-sm font-medium rounded-md hover:bg-[#547792] focus:outline-none focus:ring-2 focus:ring-[#547792] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Searching...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search
                  </span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Results Table */}
      {hasSearched && (
        <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#213448]">Properties Within Budget</h3>
              <p className="text-xs text-[#547792]">
                {loading ? 'Loading...' : `${pagination.totalRecords.toLocaleString()} properties found`}
                {budget && <span className="text-[#547792] font-medium ml-1">(max {formatBudgetDisplay(budget)})</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pagination.limit}
                onChange={(e) => {
                  setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }));
                  if (hasSearched) {
                    setTimeout(() => fetchTransactions(1), 0);
                  }
                }}
                className="text-xs border border-[#94B4C1] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#547792] text-[#213448]"
              >
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-auto" style={{ maxHeight: 500 }}>
            {error ? (
              <div className="flex items-center justify-center h-40 text-red-500">
                Error: {error}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {columns.map(col => (
                      <th
                        key={col.key}
                        className={`px-3 py-2 text-left font-medium text-slate-600 border-b border-slate-200 ${col.width} ${
                          col.sortable ? 'cursor-pointer hover:bg-slate-100 select-none' : ''
                        } ${col.align === 'right' ? 'text-right' : ''}`}
                        onClick={() => col.sortable && handleSort(col.key)}
                      >
                        <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                          <span>{col.label}</span>
                          {col.sortable && <SortIcon column={col.key} />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    // Loading skeleton
                    [...Array(pagination.limit)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {columns.map(col => (
                          <td key={col.key} className="px-3 py-2 border-b border-slate-100">
                            <div className="h-4 bg-slate-200 rounded w-full"></div>
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : data.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                        No properties found within your budget. Try increasing your budget or adjusting filters.
                      </td>
                    </tr>
                  ) : (
                    data.map((txn, idx) => (
                      <tr
                        key={txn.id || idx}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                          {formatDate(txn.transaction_date)}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-800 truncate max-w-[200px]" title={txn.project_name}>
                          {txn.project_name || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                          {txn.district || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-center">
                          {txn.bedroom_count || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {txn.area_sqft?.toLocaleString() || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-800 font-medium text-right">
                          {formatCurrency(txn.price)}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {formatCurrency(txn.psf)}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100">
                          <span className={`px-1.5 py-0.5 text-xs rounded ${
                            txn.sale_type === 'New Sale'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {txn.sale_type === 'New Sale' ? 'New' : 'Resale'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          {data.length > 0 && (
            <div className="px-4 py-3 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30 flex items-center justify-between">
              <div className="text-xs text-[#547792]">
                {!loading && data.length > 0 && (
                  <>
                    Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.totalRecords)} of {pagination.totalRecords.toLocaleString()}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePageChange(1); }}
                  disabled={pagination.page === 1 || loading}
                  className="p-1.5 rounded border border-[#94B4C1] text-[#547792] hover:bg-[#94B4C1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="First page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePageChange(pagination.page - 1); }}
                  disabled={pagination.page === 1 || loading}
                  className="p-1.5 rounded border border-[#94B4C1] text-[#547792] hover:bg-[#94B4C1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="px-3 py-1 text-sm text-[#213448]">
                  Page {pagination.page} of {pagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePageChange(pagination.page + 1); }}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="p-1.5 rounded border border-[#94B4C1] text-[#547792] hover:bg-[#94B4C1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePageChange(pagination.totalPages); }}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="p-1.5 rounded border border-[#94B4C1] text-[#547792] hover:bg-[#94B4C1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Last page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Initial state - before search */}
      {!hasSearched && (
        <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-8 text-center">
          <div className="max-w-md mx-auto">
            <svg className="w-16 h-16 mx-auto text-[#94B4C1] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="text-lg font-semibold text-[#213448] mb-2">Benchmark Transaction Prices</h3>
            <p className="text-sm text-[#547792]">
              Drag the budget slider above to set your target price ceiling and click Search to view realized transaction prices.
              Use the optional filters to narrow down by bedroom type, region, or district.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ValueParityPanel;
