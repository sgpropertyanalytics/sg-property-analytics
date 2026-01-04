import React, { useState, useMemo } from 'react';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery, useDeferredFetch } from '../../hooks';
import { getUpcomingLaunchesAll } from '../../api/client';
import { useSubscription } from '../../context/SubscriptionContext';
import { getRegionBadgeClass } from '../../constants';
import { assertKnownVersion } from '../../adapters';
import { UpcomingLaunchesField, getUpcomingLaunchesField } from '../../schemas/apiContract';
import { VerificationBadge } from '../verification';
import { ErrorState } from '../common/ErrorState';
import { getQueryErrorMessage } from '../common/QueryState';

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
export function UpcomingLaunchesTable({
  height = 400,
  compact = false,   // Compact mode for embedding (no border)
  showHeader = true, // Show/hide header
}) {
  const { isPremium, isFreeResolved } = useSubscription();
  const [sortConfig, setSortConfig] = useState({
    column: 'project_name',
    order: 'asc',
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Create a stable key for deferred fetch (changes when sort/refresh changes)
  const deferKey = useMemo(
    () => `upcoming-${sortConfig.column}-${sortConfig.order}-${refreshTrigger}`,
    [sortConfig, refreshTrigger]
  );

  // Defer fetch until table is visible (low priority - below the fold)
  const { shouldFetch, containerRef } = useDeferredFetch({
    filterKey: deferKey,
    priority: 'low',
    fetchOnMount: true,
  });

  // Handle manual refresh
  const handleRefresh = () => setRefreshTrigger(prev => prev + 1);

  // Data fetching with useGatedAbortableQuery - gates on appReady
  // enabled: shouldFetch ensures we only fetch when visible (deferred fetch)
  // isBootPending = true while waiting for app boot
  const { data, loading, error, isBootPending, refetch } = useAppQuery(
    async (signal) => {
      const params = {
        limit: 100,
        sort: sortConfig.column,
        order: sortConfig.order,
      };

      const response = await getUpcomingLaunchesAll(params, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/upcoming-launches');

      const responseData = response.data || {};
      return getUpcomingLaunchesField(responseData, UpcomingLaunchesField.DATA) || [];
    },
    [sortConfig.column, sortConfig.order, refreshTrigger],
    {
      chartName: 'UpcomingLaunchesTable',
      enabled: shouldFetch,
      initialData: null,
    }
  );

  // Combined loading state (boot + fetch)
  const isLoading = loading || isBootPending;

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
    { key: 'verification', label: 'Verified', sortable: false, width: 'w-16', align: 'center' },
  ];

  return (
    <div ref={containerRef} id="upcoming-launches-table" className={`bg-card ${compact ? '' : 'rounded-lg border border-[#94B4C1]/50'} overflow-hidden`}>
      {/* Header - conditionally shown */}
      {showHeader && (
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[#213448]">Upcoming Launches</h3>
            <p className="text-xs text-[#547792]">
              {isLoading ? 'Loading...' : `${data.length} pre-launch projects`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); handleRefresh(); }}
              className="p-1.5 text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF] rounded transition-colors"
              title="Refresh data"
              disabled={isLoading}
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden overflow-auto p-3 space-y-2" style={{ maxHeight: height }}>
        {error ? (
          <ErrorState message={getQueryErrorMessage(error)} onRetry={refetch} />
        ) : isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="p-3 bg-card rounded-lg border border-[#94B4C1]/30 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-slate-200 rounded w-1/2"></div>
            </div>
          ))
        ) : data.length === 0 ? (
          <div className="text-center py-8 text-[#547792] text-sm">
            No upcoming launches found.
          </div>
        ) : (
          data.map((project, idx) => (
            <div key={project.id || idx} className="p-3 bg-card rounded-lg border border-[#94B4C1]/30 active:bg-[#EAE0CF]/20">
              <div className="flex justify-between items-start gap-3">
                {/* Left: Project info */}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[#213448] truncate">
                    {project.project_name || '-'}
                  </div>
                  <div className="text-xs text-[#547792] mt-0.5">
                    {project.developer && project.developer !== 'TBD' ? project.developer : '-'}
                  </div>
                  <div className="text-xs text-[#547792] mt-0.5">
                    {project.total_units ? `${project.total_units.toLocaleString()} units` : '-'}
                  </div>
                </div>
                {/* Right: Date, Segment, PSF */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-[#547792]">
                    {formatDate(project.expected_launch_date, project.launch_year)}
                  </div>
                  {project.market_segment && (
                    <span className={`inline-block mt-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${getRegionBadgeClass(project.market_segment)}`}>
                      {project.market_segment}
                    </span>
                  )}
                  {(project.indicative_psf_low || project.indicative_psf_high) && (
                    <div className="text-xs text-[#213448] font-medium mt-1">
                      {formatPSFRange(project.indicative_psf_low, project.indicative_psf_high)} PSF
                    </div>
                  )}
                  {/* Mobile verification indicator */}
                  {project.verification_status && (
                    <div className="mt-1 flex items-center justify-end">
                      <VerificationBadge
                        status={project.verification_status}
                        confidence={project.units_confidence_score}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-auto" style={{ maxHeight: height }}>
        {error ? (
          <div className="p-3">
            <ErrorState message={getQueryErrorMessage(error)} onRetry={refetch} />
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
            <tbody className={isFreeResolved ? 'blur-sm grayscale-[40%]' : ''}>
              {isLoading ? (
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
                        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${getRegionBadgeClass(project.market_segment)}`}>
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
                    {/* Verification Status */}
                    <td className="px-3 py-2 border-b border-slate-100 text-center">
                      {project.verification_status ? (
                        <VerificationBadge
                          status={project.verification_status}
                          confidence={project.units_confidence_score}
                        />
                      ) : (
                        <span className="text-slate-300 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default UpcomingLaunchesTable;
