import React, { useEffect, useState, useCallback } from 'react';
import { getHotProjects } from '../../api/client';

/**
 * Hot Projects Table - Shows active new launch projects based on New Sale transactions
 *
 * Displays:
 * - Project Name (with Popular School tag)
 * - Region / District (stacked)
 * - Market Segment (CCR/RCR/OCR)
 * - Units Sold (transaction count)
 * - Total Value
 * - Avg PSF
 * - Sales Period (first to last sale date)
 *
 * Data derived from transactions where sale_type = 'New Sale'.
 */
export function HotProjectsTable({ height = 400 }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    column: 'units_sold',
    order: 'desc',
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getHotProjects();
      setData(response.data.projects || []);
    } catch (err) {
      console.error('Error fetching hot projects:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle sort
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  };

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortConfig.column] ?? 0;
    const bVal = b[sortConfig.column] ?? 0;
    if (typeof aVal === 'string') {
      return sortConfig.order === 'desc'
        ? bVal.localeCompare(aVal)
        : aVal.localeCompare(bVal);
    }
    return sortConfig.order === 'desc' ? bVal - aVal : aVal - bVal;
  });

  // Format currency
  const formatCurrency = (value) => {
    if (!value) return '-';
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toLocaleString()}`;
  };

  // Format date range
  const formatDateRange = (first, last) => {
    if (!first) return '-';
    const formatDate = (d) => new Date(d).toLocaleDateString('en-SG', { month: 'short', year: '2-digit' });
    if (first === last) return formatDate(first);
    return `${formatDate(first)} - ${formatDate(last)}`;
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
    { key: 'project_name', label: 'Project Name', sortable: true, width: 'w-52' },
    { key: 'district', label: 'Location', sortable: true, width: 'w-28' },
    { key: 'market_segment', label: 'Segment', sortable: true, width: 'w-20' },
    { key: 'units_sold', label: 'Units Sold', sortable: true, width: 'w-24', align: 'right' },
    { key: 'total_value', label: 'Total Value', sortable: true, width: 'w-28', align: 'right' },
    { key: 'avg_psf', label: 'Avg PSF', sortable: true, width: 'w-24', align: 'right' },
    { key: 'first_sale', label: 'Sales Period', sortable: true, width: 'w-32' },
  ];

  return (
    <div id="hot-projects-table" className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#213448]">Hot Projects - Market Inventory</h3>
          <p className="text-xs text-[#547792]">
            {loading ? 'Loading...' : `${data.length} projects`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); fetchData(); }}
            className="p-1.5 text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF] rounded transition-colors"
            title="Refresh data"
            disabled={loading}
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-auto" style={{ maxHeight: height }}>
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
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {columns.map(col => (
                      <td key={col.key} className="px-3 py-2 border-b border-slate-100">
                        <div className="h-4 bg-slate-200 rounded w-full"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                    No active projects found
                  </td>
                </tr>
              ) : (
                sortedData.map((project, idx) => (
                  <tr
                    key={project.project_name || idx}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    {/* Project Name with School Tag */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-800 truncate max-w-[200px]" title={project.project_name}>
                          {project.project_name || '-'}
                        </span>
                        {project.has_popular_school && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full w-fit">
                            <span>Popular School</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Location - Region / District stacked */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700">{project.region || '-'}</span>
                        <span className="text-xs text-slate-500">{project.district || '-'}</span>
                      </div>
                    </td>

                    {/* Market Segment */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${
                        project.market_segment === 'CCR' ? 'bg-[#213448]/10 text-[#213448]' :
                        project.market_segment === 'RCR' ? 'bg-[#547792]/10 text-[#547792]' :
                        'bg-[#94B4C1]/20 text-[#547792]'
                      }`}>
                        {project.market_segment || '-'}
                      </span>
                    </td>

                    {/* Units Sold */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right font-medium">
                      {project.units_sold?.toLocaleString() || '0'}
                    </td>

                    {/* Total Value */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                      {formatCurrency(project.total_value)}
                    </td>

                    {/* Avg PSF */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                      {project.avg_psf ? `$${project.avg_psf.toLocaleString()}` : '-'}
                    </td>

                    {/* Sales Period */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-500 text-xs">
                      {formatDateRange(project.first_sale, project.last_sale)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30">
        <div className="flex items-center justify-between text-xs text-[#547792]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-[#213448]/10 text-[#213448] rounded text-[10px]">CCR</span>
              <span>Core Central</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-[#547792]/10 text-[#547792] rounded text-[10px]">RCR</span>
              <span>Rest of Central</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-[#94B4C1]/20 text-[#547792] rounded text-[10px]">OCR</span>
              <span>Outside Central</span>
            </span>
          </div>
          <span className="text-[#547792]/70">
            New Sale transactions only
          </span>
        </div>
      </div>
    </div>
  );
}

export default HotProjectsTable;
