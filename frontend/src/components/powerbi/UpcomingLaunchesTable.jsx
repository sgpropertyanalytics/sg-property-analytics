import React, { useEffect, useState, useCallback } from 'react';
import { getUpcomingLaunchesAll } from '../../api/client';
import { useSubscription } from '../../context/SubscriptionContext';

/**
 * Upcoming Launches Table - Shows projects NOT YET LAUNCHED (pre-sale info)
 *
 * SEMANTIC CLARIFICATION:
 * - "Upcoming Launches" = Projects that have NOT YET LAUNCHED
 * - For ACTIVE sales data (already launched), see ActiveNewSalesTable (HotProjectsTable)
 *
 * Displays:
 * - Potential Launch Date (expected_launch_date or created from launch_year)
 * - Project Name
 * - Segment (CCR/RCR/OCR)
 * - Developer
 * - PSF (PPR) - from linked GLS tender land bid
 * - Implied Launch PSF - indicative pricing range
 *
 * Data Source: /api/upcoming-launches/* (EdgeProp, PropNex, ERA)
 */
export function UpcomingLaunchesTable({ height = 400 }) {
  const subscriptionContext = useSubscription();
  const isPremium = subscriptionContext?.isPremium ?? true;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    column: 'project_name',
    order: 'asc',
  });

  // Fetch data when sort changes
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        limit: 100,
        sort: sortConfig.column,
        order: sortConfig.order,
      };

      const response = await getUpcomingLaunchesAll(params);
      setData(response.data.data || []);
    } catch (err) {
      console.error('Error fetching upcoming launches data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sortConfig]);

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

  // Column definitions - standardized to match HotProjectsTable
  const columns = [
    { key: 'expected_launch_date', label: 'Launch Date', sortable: true, width: 'w-24' },
    { key: 'project_name', label: 'Project', sortable: true, width: 'w-48' },
    { key: 'developer', label: 'Developer', sortable: true, width: 'w-40' },
    { key: 'market_segment', label: 'Segment', sortable: true, width: 'w-20' },
    { key: 'total_units', label: 'Total Units', sortable: true, width: 'w-20', align: 'right' },
    { key: 'indicative_psf', label: 'Est. PSF', sortable: false, width: 'w-32', align: 'right' },
  ];

  return (
    <div id="upcoming-launches-table">
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
            <tbody className={!isPremium ? 'blur-sm grayscale-[40%]' : ''}>
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
                    <div className="text-slate-500">No upcoming launches found.</div>
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
                    {/* Launch Date */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-sm">
                      {formatDate(project.expected_launch_date, project.launch_year)}
                    </td>
                    {/* Project Name */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <span className="font-medium text-slate-800 truncate max-w-[200px] block text-sm" title={project.project_name}>
                        {project.project_name || '-'}
                      </span>
                    </td>
                    {/* Developer */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <span className="text-slate-600 truncate max-w-[150px] block text-sm" title={project.developer}>
                        {project.developer === 'TBD' ? (
                          <span className="text-slate-400 italic">-</span>
                        ) : (
                          project.developer || <span className="text-slate-400 italic">-</span>
                        )}
                      </span>
                    </td>
                    {/* Segment - using theme colors to match HotProjectsTable */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      {project.market_segment ? (
                        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${
                          project.market_segment === 'CCR' ? 'bg-[#213448] text-white' :
                          project.market_segment === 'RCR' ? 'bg-[#547792] text-white' :
                          'bg-[#94B4C1] text-[#213448]'
                        }`}>
                          {project.market_segment}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </td>
                    {/* Total Units */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right text-sm">
                      {project.total_units ? project.total_units.toLocaleString() : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>
                    {/* Est. PSF */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right text-sm">
                      {project.indicative_psf_low || project.indicative_psf_high ? (
                        <span title="Indicative pricing from cross-validated sources">
                          {formatPSFRange(project.indicative_psf_low, project.indicative_psf_high)}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with legend - using theme colors to match HotProjectsTable */}
      <div className="px-4 py-2 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30">
        <div className="flex items-center justify-between text-xs text-[#547792] mb-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="px-1 py-0.5 bg-[#213448] text-white text-[9px] rounded">CCR</span>
              <span>Core Central</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="px-1 py-0.5 bg-[#547792] text-white text-[9px] rounded">RCR</span>
              <span>Rest of Central</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="px-1 py-0.5 bg-[#94B4C1] text-[#213448] text-[9px] rounded">OCR</span>
              <span>Outside Central</span>
            </span>
          </div>
          <span className="text-[#547792]/70">
            Sources: ERA, EdgeProp, PropertyReview
          </span>
        </div>
        {/* Glossary */}
        <div className="flex items-center gap-4 text-[10px] text-[#547792] border-t border-[#94B4C1]/30 pt-2">
          <span><strong>PSF</strong> = Price per Square Foot</span>
          <span><strong>Est.</strong> = Estimated</span>
        </div>
      </div>
    </div>
  );
}

export default UpcomingLaunchesTable;
