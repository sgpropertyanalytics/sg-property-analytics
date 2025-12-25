import React, { useEffect, useState, useCallback } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getTransactionsList } from '../../api/client';
import { BlurredProject, BlurredCurrency, BlurredArea, BlurredPSF } from '../BlurredCell';
import { useSubscription } from '../../context/SubscriptionContext';

/**
 * Transaction Data Table - Responsive table showing transaction-level details
 *
 * Features:
 * - Automatically updates when filters change
 * - Pagination controls
 * - Sortable columns
 * - Shows key transaction fields
 */
export function TransactionDataTable({ height = 400 }) {
  const { buildApiParams, activeFilterCount, crossFilter, highlight, factFilter } = usePowerBIFilters();
  const subscriptionContext = useSubscription();
  const isPremium = subscriptionContext?.isPremium ?? true;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    totalRecords: 0,
    totalPages: 0,
  });
  const [sortConfig, setSortConfig] = useState({
    column: 'transaction_date',
    order: 'desc',
  });

  // Fetch data when filters, pagination, or sort changes
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // includeFactFilter: true enables one-way filtering from dimension charts
      // (e.g., Price Distribution click filters this table but not other dimension charts)
      const params = buildApiParams({
        page: pagination.page,
        limit: pagination.limit,
        sort_by: sortConfig.column,
        sort_order: sortConfig.order,
      }, { includeFactFilter: true });
      const response = await getTransactionsList(params);
      setData(response.data.transactions || []);
      setPagination(prev => ({
        ...prev,
        totalRecords: response.data.pagination?.total_records || 0,
        totalPages: response.data.pagination?.total_pages || 0,
      }));
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [buildApiParams, pagination.page, pagination.limit, sortConfig, highlight]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset to page 1 when filters change (including factFilter from dimension chart clicks)
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [activeFilterCount, crossFilter.value, highlight.value, factFilter]);

  // Handle sort
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'asc' ? 'desc' : 'asc',
    }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  // Format date - show only month and year (raw data doesn't have actual days)
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

  return (
    <div id="transaction-data-table" className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#213448]">Transaction Details</h3>
          <p className="text-xs text-[#547792]">
            {loading ? 'Loading...' : `${pagination.totalRecords.toLocaleString()} transactions`}
            {activeFilterCount > 0 && <span className="text-[#547792] font-medium ml-1">({activeFilterCount} filters applied)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pagination.limit}
            onChange={(e) => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
            className="text-xs border border-[#94B4C1] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#547792] text-[#213448]"
          >
            <option value={10}>10 rows</option>
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); fetchData(); }}
            className="p-1.5 text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF] rounded transition-colors"
            title="Refresh data"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden overflow-auto p-3 space-y-2" style={{ maxHeight: height }}>
        {error ? (
          <div className="flex items-center justify-center h-40 text-red-500">
            Error: {error}
          </div>
        ) : loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="p-3 bg-white rounded-lg border border-[#94B4C1]/30 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-slate-200 rounded w-1/2"></div>
            </div>
          ))
        ) : data.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No transactions found matching the current filters
          </div>
        ) : (
          <div className={!isPremium ? 'blur-sm grayscale-[40%]' : ''}>
            {data.map((txn, idx) => (
              <div key={txn.id || idx} className="p-3 bg-white rounded-lg border border-[#94B4C1]/30">
                {/* Header: Project + Type Badge */}
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[#213448] truncate">
                      <BlurredProject
                        value={txn.project_name}
                        masked={txn.project_name_masked}
                        district={txn.district}
                        source="table"
                      />
                    </div>
                    <div className="text-xs text-[#547792]">
                      {txn.district || '-'} • {formatDate(txn.transaction_date)}
                    </div>
                  </div>
                  <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs rounded ${
                    txn.sale_type === 'New Sale'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {txn.sale_type === 'New Sale' ? 'New' : 'Resale'}
                  </span>
                </div>
                {/* Metrics Row */}
                <div className="flex justify-between items-center text-sm">
                  <div className="text-[#213448] font-semibold">
                    <BlurredCurrency
                      value={txn.price}
                      masked={txn.price_masked}
                      field="price"
                      source="table"
                    />
                  </div>
                  <div className="text-xs text-[#547792]">
                    <BlurredPSF value={txn.psf} masked={txn.psf_masked} source="table" /> PSF
                  </div>
                </div>
                {/* Details Row */}
                <div className="flex justify-between mt-1 text-xs text-[#547792]">
                  <span>{txn.bedroom_count || '-'}BR</span>
                  <span><BlurredArea value={txn.area_sqft} masked={txn.area_sqft_masked} source="table" /> sqft</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-auto" style={{ maxHeight: height }}>
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
            <tbody className={!isPremium ? 'blur-sm grayscale-[40%]' : ''}>
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
                    No transactions found matching the current filters
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
                    <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-800 truncate max-w-[200px]">
                      <BlurredProject
                        value={txn.project_name}
                        masked={txn.project_name_masked}
                        district={txn.district}
                        source="table"
                      />
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                      {txn.district || '-'}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-center">
                      {txn.bedroom_count || '-'}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                      <BlurredArea
                        value={txn.area_sqft}
                        masked={txn.area_sqft_masked}
                        source="table"
                      />
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-800 font-medium text-right">
                      <BlurredCurrency
                        value={txn.price}
                        masked={txn.price_masked}
                        field="price"
                        source="table"
                      />
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                      <BlurredPSF
                        value={txn.psf}
                        masked={txn.psf_masked}
                        source="table"
                      />
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
      <div className="px-4 py-3 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30">
        {/* Glossary */}
        <div className="flex items-center gap-4 text-[10px] text-[#547792] mb-2">
          <span><strong>PSF</strong> = Price per Square Foot</span>
          <span><strong>BR</strong> = Bedroom</span>
        </div>
        <div className="flex items-center justify-between">
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
      </div>
    </div>
  );
}

export default TransactionDataTable;
