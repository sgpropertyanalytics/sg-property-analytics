import React, { useEffect, useState } from 'react';
import { useStaleRequestGuard } from '../../hooks';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getTransactionsList } from '../../api/client';
import { DISTRICT_NAMES, formatPrice, formatPSF } from '../../constants';
import { BlurredProject, BlurredCurrency, BlurredArea, BlurredPSF } from '../BlurredCell';
import { isSaleType, getTxnField, TxnField } from '../../schemas/apiContract';

/**
 * Transaction Detail Modal - Drill-Through
 *
 * Opens when user clicks on a data point to see underlying transactions.
 * Shows paginated list with sorting.
 */
export function TransactionDetailModal({ isOpen, onClose, title, additionalFilters = {} }) {
  const { buildApiParams } = usePowerBIFilters();
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total_records: 0,
    total_pages: 0,
  });
  const [sortBy, setSortBy] = useState('transaction_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Prevent stale responses and cancel in-flight requests
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Stable key for additionalFilters to prevent unnecessary refetches
  const additionalFiltersKey = JSON.stringify(additionalFilters);

  // Fetch transactions when modal opens or filters change
  useEffect(() => {
    if (!isOpen) return;

    const requestId = startRequest();
    const signal = getSignal();

    const fetchTransactions = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = buildApiParams({
          ...additionalFilters,
          page: pagination.page,
          limit: pagination.limit,
          sort_by: sortBy,
          sort_order: sortOrder,
        });
        const response = await getTransactionsList(params, { signal });

        // Ignore stale responses
        if (isStale(requestId)) return;

        setTransactions(response.data.transactions || []);
        setPagination(prev => ({
          ...prev,
          ...response.data.pagination,
        }));
      } catch (err) {
        // Ignore abort errors - expected when request is cancelled
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        if (isStale(requestId)) return;
        console.error('Error fetching transactions:', err);
        setError(err.message);
      } finally {
        if (!isStale(requestId)) {
          setLoading(false);
        }
      }
    };
    fetchTransactions();
    // additionalFiltersKey is a stable JSON string of additionalFilters, used for dep comparison
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, additionalFiltersKey, pagination.page, pagination.limit, sortBy, sortOrder, startRequest, isStale, getSignal, buildApiParams]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  if (!isOpen) return null;

  const SortIcon = ({ column }) => {
    if (sortBy !== column) {
      return <span className="text-slate-300 ml-1">↕</span>;
    }
    return <span className="text-blue-500 ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                {title || 'Transaction Details'}
              </h2>
              <p className="text-sm text-slate-500">
                {pagination.total_records.toLocaleString()} transactions found
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">Loading transactions...</div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-red-500">Error: {error}</div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">No transactions found</div>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('transaction_date')}
                    >
                      Date <SortIcon column="transaction_date" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('project_name')}
                    >
                      Project <SortIcon column="project_name" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('district')}
                    >
                      District <SortIcon column="district" />
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('bedroom_count')}
                    >
                      BR <SortIcon column="bedroom_count" />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('area_sqft')}
                    >
                      Size (sqft) <SortIcon column="area_sqft" />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('price')}
                    >
                      Price <SortIcon column="price" />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('psf')}
                    >
                      PSF <SortIcon column="psf" />
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      Tenure
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((txn, index) => (
                    <tr key={txn.id || index} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                        {txn.transaction_date}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800 font-medium max-w-xs truncate">
                        <BlurredProject
                          value={txn.project_name}
                          masked={txn.project_name_masked}
                          district={txn.district}
                          source="modal"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <span className="font-medium">{txn.district}</span>
                        <span className="text-slate-400 text-xs ml-1">
                          {DISTRICT_NAMES[txn.district]?.slice(0, 15) || ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 text-center">
                        {txn.bedroom_count}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 text-right">
                        <BlurredArea
                          value={txn.area_sqft}
                          masked={txn.area_sqft_masked}
                          source="modal"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800 font-medium text-right">
                        <BlurredCurrency
                          value={txn.price}
                          masked={txn.price_masked}
                          field="price"
                          source="modal"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 text-right">
                        <BlurredPSF
                          value={txn.psf}
                          masked={txn.psf_masked}
                          source="modal"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          isSaleType.newSale(getTxnField(txn, TxnField.SALE_TYPE))
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {isSaleType.newSale(getTxnField(txn, TxnField.SALE_TYPE)) ? 'New' : 'Resale'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 max-w-[120px] truncate">
                        {txn.tenure || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer with pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-500">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total_records)} of{' '}
              {pagination.total_records.toLocaleString()} transactions
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className={`px-3 py-1.5 text-sm rounded border ${
                  pagination.page <= 1
                    ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className={`px-3 py-1.5 text-sm rounded border ${
                  pagination.page >= pagination.total_pages
                    ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TransactionDetailModal;
