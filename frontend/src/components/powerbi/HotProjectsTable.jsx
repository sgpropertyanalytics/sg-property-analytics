import React, { useEffect, useState, useCallback } from 'react';
import { getHotProjects } from '../../api/client';

/**
 * Active New Sales Table - Shows LAUNCHED projects with sales progress
 *
 * SEMANTIC CLARIFICATION:
 * - "Active New Sales" = Projects that have ALREADY LAUNCHED and are selling
 * - NOT "Upcoming Launches" (see UpcomingLaunchesTable component)
 *
 * Data Sources:
 * - units_sold: COUNT(transactions WHERE sale_type='New Sale') - DETERMINISTIC
 * - total_units: project_inventory.total_units (from URA API) - AUTHORITATIVE
 *
 * Displays:
 * - Project Name (with Popular School tag)
 * - Region / District (stacked)
 * - Total Units (from URA API)
 * - Units Sold (transaction count)
 * - % Sold (color-coded)
 * - Unsold Inventory (calculated)
 */
export function HotProjectsTable({ height = 400 }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    column: 'units_sold',  // Default: sort by most units sold
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
    const aVal = a[sortConfig.column] ?? -Infinity;
    const bVal = b[sortConfig.column] ?? -Infinity;
    if (typeof aVal === 'string') {
      return sortConfig.order === 'desc'
        ? bVal.localeCompare(aVal)
        : aVal.localeCompare(bVal);
    }
    return sortConfig.order === 'desc' ? bVal - aVal : aVal - bVal;
  });

  // Color coding for % sold
  const getPercentClass = (percent) => {
    if (percent === null || percent === undefined) return 'bg-slate-100 text-slate-500';
    if (percent >= 80) return 'bg-red-100 text-red-700';      // Almost sold out
    if (percent >= 50) return 'bg-amber-100 text-amber-700';  // Selling well
    return 'bg-green-100 text-green-700';                      // Available
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
  // Note: Shows ACTIVE NEW SALES (projects with New Sale transactions but NO resales yet)
  // - units_sold: count of New Sale transactions
  // - total_units: from project_inventory (URA API or manual entry)
  // - Only shows projects with ZERO resale transactions (true new launches)
  const columns = [
    { key: 'project_name', label: 'Project Name', sortable: true, width: 'w-56' },
    { key: 'district', label: 'Location', sortable: true, width: 'w-36' },
    { key: 'units_sold', label: 'Units Sold', sortable: true, width: 'w-24', align: 'right' },
    { key: 'total_units', label: 'Total Units', sortable: true, width: 'w-24', align: 'right' },
    { key: 'percent_sold', label: '% Sold', sortable: true, width: 'w-20', align: 'right' },
    { key: 'unsold_inventory', label: 'Unsold', sortable: true, width: 'w-20', align: 'right' },
  ];

  return (
    <div id="hot-projects-table" className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#213448]">Active New Sales</h3>
          <p className="text-xs text-[#547792]">
            {loading ? 'Loading...' : `${data.length} launched projects with sales activity`}
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
                    {/* Project Name with School Tag (inline) */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-800 truncate max-w-[200px]">
                          {project.project_name || '-'}
                        </span>
                        {project.has_popular_school && (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded whitespace-nowrap w-fit">
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                              </svg>
                              <span>Popular School within 1km</span>
                            </span>
                            {project.nearby_schools && project.nearby_schools.length > 0 && (
                              <span className="text-[10px] text-emerald-600 pl-1 truncate max-w-[200px]">
                                {project.nearby_schools.slice(0, 2).join(', ')}
                                {project.nearby_schools.length > 2 && ` +${project.nearby_schools.length - 2} more`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Region / District - stacked with full name */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700">{project.district_name || project.region || '-'}</span>
                        <span className="text-xs text-slate-500">{project.district || '-'}</span>
                      </div>
                    </td>

                    {/* Units Sold */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-700 text-right font-medium">
                      {project.units_sold?.toLocaleString() || '0'}
                    </td>

                    {/* Total Units */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                      {project.total_units?.toLocaleString() || (
                        <span className="text-slate-400 text-xs italic">N/A</span>
                      )}
                    </td>

                    {/* % Sold with color coding */}
                    <td className="px-3 py-2 border-b border-slate-100 text-right">
                      {project.percent_sold !== null && project.percent_sold !== undefined ? (
                        <span className="inline-flex items-center gap-1">
                          <span className={`inline-block px-1.5 py-0.5 text-xs font-semibold rounded ${getPercentClass(project.percent_sold)}`}>
                            {project.percent_sold.toFixed(1)}%
                          </span>
                          {project.data_discrepancy && (
                            <span className="text-amber-500 text-xs">*</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">N/A</span>
                      )}
                    </td>

                    {/* Unsold Inventory */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                      {project.unsold_inventory !== null && project.unsold_inventory !== undefined ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          <span>{project.unsold_inventory.toLocaleString()}</span>
                          {project.data_discrepancy && (
                            <span className="text-amber-500 text-xs">*</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">N/A</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with legend and footnotes */}
      <div className="px-4 py-3 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30">
        {/* Legend row */}
        <div className="flex items-center flex-wrap gap-3 text-xs text-[#547792] mb-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-red-400 rounded-full"></span>
            <span>80%+ Sold</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
            <span>50-79%</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            <span>&lt;50%</span>
          </span>
        </div>
        {/* Footnotes */}
        <div className="text-[10px] text-[#547792]/80 space-y-0.5">
          <p>Only projects with 0 resales shown (true new launches still in developer sales phase).</p>
          <p><span className="text-amber-500 font-medium">*</span> Data discrepancy: URA transaction count exceeds official unit count. Mixed-use developments may include commercial units, serviced apartments, or sub-sales.</p>
        </div>
      </div>
    </div>
  );
}

export default HotProjectsTable;
