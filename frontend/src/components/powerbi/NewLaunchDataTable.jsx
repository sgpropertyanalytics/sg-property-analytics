import React, { useEffect, useState, useCallback } from 'react';
import { getNewLaunchesAll } from '../../api/client';

/**
 * Upcoming New Launches Table - Shows projects NOT YET LAUNCHED (pre-sale info)
 *
 * SEMANTIC CLARIFICATION:
 * - "Upcoming New Launches" = Projects that have NOT YET LAUNCHED
 * - For ACTIVE sales data (already launched), see HotProjectsTable / Active New Sales
 *
 * Displays:
 * - Potential Launch Date (expected_launch_date or created from launch_year)
 * - Project Name
 * - Segment (CCR/RCR/OCR)
 * - Developer
 * - PSF (PPR) - from linked GLS tender land bid
 * - Implied Launch PSF - indicative pricing range
 *
 * Data Source: /api/new-launches/* (EdgeProp, PropNex, ERA)
 */
export function NewLaunchDataTable({ height = 400 }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [segmentFilter, setSegmentFilter] = useState(''); // '', 'CCR', 'RCR', 'OCR'
  const [sortConfig, setSortConfig] = useState({
    column: 'project_name',
    order: 'asc',
  });

  // Fetch data when filters change
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        limit: 100,
        launch_year: 2026,
        sort: sortConfig.column,
        order: sortConfig.order,
      };

      if (segmentFilter) {
        params.market_segment = segmentFilter;
      }

      const response = await getNewLaunchesAll(params);
      setData(response.data.data || []);
    } catch (err) {
      console.error('Error fetching new launches data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [segmentFilter, sortConfig]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle sort
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Format date - show month and year
  const formatDate = (dateStr, launchYear) => {
    if (dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-SG', {
        year: 'numeric',
        month: 'short',
      });
    }
    // Fallback to launch year if no specific date
    return launchYear ? `${launchYear}` : '-';
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    return `$${Math.round(value).toLocaleString()}`;
  };

  // Format PSF range
  const formatPSFRange = (low, high) => {
    if (!low && !high) return '-';
    if (low && high && low !== high) {
      return `$${Math.round(low).toLocaleString()} – $${Math.round(high).toLocaleString()}`;
    }
    return formatCurrency(low || high);
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
    { key: 'expected_launch_date', label: 'Potential Launch Date', sortable: true, width: 'w-28' },
    { key: 'project_name', label: 'Project Name', sortable: true, width: 'w-48' },
    { key: 'market_segment', label: 'Segment', sortable: true, width: 'w-16' },
    { key: 'developer', label: 'Developer', sortable: true, width: 'w-44' },
    { key: 'land_bid_psf', label: 'PSF (PPR)', sortable: true, width: 'w-24', align: 'right' },
    { key: 'indicative_psf', label: 'Implied Launch PSF', sortable: false, width: 'w-36', align: 'right' },
  ];

  // Count by segment
  const segmentCounts = data.reduce((acc, item) => {
    const seg = item.market_segment || 'Unknown';
    acc[seg] = (acc[seg] || 0) + 1;
    return acc;
  }, {});

  return (
    <div id="new-launch-data-table" className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-[#213448]">Upcoming New Launches</h3>
            <p className="text-xs text-[#547792]">
              {loading ? 'Loading...' : `${data.length} projects`}
              {!loading && data.length > 0 && (
                <span className="ml-2">
                  (CCR: {segmentCounts.CCR || 0} | RCR: {segmentCounts.RCR || 0} | OCR: {segmentCounts.OCR || 0})
                </span>
              )}
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

        {/* Filter controls */}
        <div className="flex items-center gap-3">
          {/* Segment filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[#547792]">Segment:</span>
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="text-xs border border-[#94B4C1] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#547792] text-[#213448]"
            >
              <option value="">All</option>
              <option value="CCR">CCR</option>
              <option value="RCR">RCR</option>
              <option value="OCR">OCR</option>
            </select>
          </div>
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
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center">
                    <div className="text-slate-500">No upcoming new launches found.</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Run the scraper to fetch pre-launch data from EdgeProp, PropNex, ERA.
                    </p>
                  </td>
                </tr>
              ) : (
                data.map((project, idx) => (
                  <tr
                    key={project.id || idx}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                      {formatDate(project.expected_launch_date, project.launch_year)}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-800 truncate max-w-[250px]" title={project.project_name}>
                      {project.project_name || '-'}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100">
                      {project.market_segment ? (
                        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                          project.market_segment === 'CCR'
                            ? 'bg-purple-100 text-purple-700'
                            : project.market_segment === 'RCR'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-teal-100 text-teal-700'
                        }`}>
                          {project.market_segment}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 truncate max-w-[220px]" title={project.developer}>
                      {project.developer || <span className="text-slate-400 italic">TBD</span>}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-800 font-medium text-right">
                      {project.land_bid_psf ? formatCurrency(project.land_bid_psf) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-700 text-right">
                      {project.indicative_psf_low || project.indicative_psf_high ? (
                        <span title="Indicative pricing from cross-validated sources">
                          {formatPSFRange(project.indicative_psf_low, project.indicative_psf_high)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with legend */}
      <div className="px-4 py-2 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30">
        <div className="flex items-center justify-between text-xs text-[#547792]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
              <span>CCR = Core Central</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
              <span>RCR = Rest of Central</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-teal-400 rounded-full"></span>
              <span>OCR = Outside Central</span>
            </span>
          </div>
          <span className="text-[#547792]/70">
            PSF (PPR) = Land cost per sqft of GFA
          </span>
        </div>
      </div>

      {/* Methodology footnote */}
      <div className="px-4 py-3 border-t border-[#94B4C1]/20 bg-slate-50/50">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <span className="font-medium text-slate-600">Data sources:</span>{' '}
          Cross-validated from EdgeProp, PropNex, and ERA. Discrepancies flagged for review.
          PSF (PPR) linked from awarded GLS tender data where available.
        </p>
      </div>
    </div>
  );
}

export default NewLaunchDataTable;
