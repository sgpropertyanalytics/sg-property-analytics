import React, { useState, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { getHotProjects } from '../../api/client';
import { BlurredProject, BlurredCurrency } from '../BlurredCell';
import { useSubscription } from '../../context/SubscriptionContext';
import { SuppressedValue } from '../SuppressedValue';
import { getRegionBadgeClass } from '../../constants';

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
export function HotProjectsTable({
  height = 400,
  // Optional filter props - when provided, table filters by these values
  filters = null,  // { priceMin, priceMax, bedroom, region, district }
  compact = false, // Compact mode for embedding
  showHeader = true, // Show/hide header
  onDataLoad = null, // Callback with data count after loading
  excludeSoldOut = false, // When true, exclude projects with 0 unsold units
}) {
  const subscriptionContext = useSubscription();
  const isPremium = subscriptionContext?.isPremium ?? true;
  const [sortConfig, setSortConfig] = useState({
    column: 'first_new_sale',  // Default: sort by latest launch date
    order: 'desc',
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Handle manual refresh
  const handleRefresh = () => setRefreshTrigger(prev => prev + 1);

  // Stable key for filters to prevent unnecessary refetches
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data, loading, error } = useAbortableQuery(
    async (signal) => {
      const params = { limit: 200 };

      // Apply filters if provided
      if (filters) {
        if (filters.priceMin) params.price_min = filters.priceMin;
        if (filters.priceMax) params.price_max = filters.priceMax;
        if (filters.bedroom) params.bedroom = filters.bedroom;
        if (filters.region) params.market_segment = filters.region;
        if (filters.district) params.district = filters.district;
      }

      const response = await getHotProjects(params, { signal });
      const projects = response.data.projects || [];

      // Notify parent of data count
      if (onDataLoad) {
        onDataLoad(projects.length);
      }

      return projects;
    },
    [filtersKey, refreshTrigger],
    {
      initialData: [],
      onSuccess: (projects) => {
        if (onDataLoad) onDataLoad(projects.length);
      }
    }
  );

  // Handle sort
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  };

  // Filter and sort data
  const sortedData = [...data]
    // Filter out sold-out projects if excludeSoldOut is true
    .filter(project => {
      if (!excludeSoldOut) return true;
      // Keep projects that have unsold inventory > 0
      // Also keep projects where unsold_inventory is null/undefined (unknown inventory)
      return project.unsold_inventory === null ||
             project.unsold_inventory === undefined ||
             project.unsold_inventory > 0;
    })
    .sort((a, b) => {
      const aVal = a[sortConfig.column] ?? -Infinity;
      const bVal = b[sortConfig.column] ?? -Infinity;
      if (typeof aVal === 'string') {
        return sortConfig.order === 'desc'
          ? bVal.localeCompare(aVal)
          : aVal.localeCompare(bVal);
      }
      return sortConfig.order === 'desc' ? bVal - aVal : aVal - bVal;
    });

  // Color coding for % sold (BUYER-CENTRIC: indicates inventory availability)
  // Green = high availability (good for buyers), Red = low availability (act fast)
  const getPercentClass = (percent) => {
    if (percent === null || percent === undefined) return 'bg-slate-100 text-slate-500';
    if (percent >= 80) return 'bg-red-100 text-red-700';      // Low inventory - act fast
    if (percent >= 50) return 'bg-amber-100 text-amber-700';  // Moderate inventory
    return 'bg-green-100 text-green-700';                      // High inventory available
  };

  // Calculate min/max for color scaling (reserved for future use)
  // eslint-disable-next-line no-unused-vars
  const _priceRange = React.useMemo(() => {
    const prices = data.filter(p => p.median_price).map(p => p.median_price);
    const psfs = data.filter(p => p.median_psf).map(p => p.median_psf);
    return {
      minPrice: Math.min(...prices) || 0,
      maxPrice: Math.max(...prices) || 1,
      minPsf: Math.min(...psfs) || 0,
      maxPsf: Math.max(...psfs) || 1,
    };
  }, [data]);

  // Color scale using theme colors: highest = #213448, lowest = #EAE0CF (reserved for future use)
  // eslint-disable-next-line no-unused-vars
  const _getValueColor = (value, min, max) => {
    if (value === null || value === undefined) return { bg: '#f1f5f9', text: '#64748b' };
    const ratio = (value - min) / (max - min || 1);
    // Interpolate between colors based on ratio
    // Low (0): #EAE0CF (cream) -> High (1): #213448 (deep navy)
    if (ratio >= 0.8) return { bg: 'rgba(33, 52, 72, 0.15)', text: '#213448' };      // Deep Navy
    if (ratio >= 0.6) return { bg: 'rgba(84, 119, 146, 0.15)', text: '#3d5a73' };    // Ocean Blue
    if (ratio >= 0.4) return { bg: 'rgba(148, 180, 193, 0.2)', text: '#547792' };    // Sky Blue
    if (ratio >= 0.2) return { bg: 'rgba(234, 224, 207, 0.5)', text: '#6b7c6b' };    // Light
    return { bg: 'rgba(234, 224, 207, 0.3)', text: '#8b9a8b' };                       // Cream (lowest)
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

  // Column definitions - standardized labels to match UpcomingLaunchesTable
  // Note: Shows ACTIVE NEW SALES (projects with New Sale transactions but NO resales yet)
  // - units_sold: count of New Sale transactions
  // - total_units: from project_inventory (URA API or manual entry)
  // - Only shows projects with ZERO resale transactions (true new launches)
  const columns = [
    { key: 'first_new_sale', label: 'Launch Date', sortable: true, width: 'w-24' },
    { key: 'project_name', label: 'Project', sortable: true, width: 'w-48' },
    { key: 'developer', label: 'Developer', sortable: true, width: 'w-40' },
    { key: 'district', label: 'Location', sortable: true, width: 'w-32' },
    { key: 'market_segment', label: 'Segment', sortable: true, width: 'w-20' },
    { key: 'total_units', label: 'Total Units', sortable: true, width: 'w-20', align: 'right' },
    { key: 'units_sold', label: 'Sold', sortable: true, width: 'w-16', align: 'right' },
    { key: 'percent_sold', label: '% Sold', sortable: true, width: 'w-16', align: 'right' },
    { key: 'unsold_inventory', label: 'Unsold', sortable: true, width: 'w-16', align: 'right' },
    { key: 'median_price', label: 'Med. Price', sortable: true, width: 'w-24', align: 'right' },
    { key: 'median_psf', label: 'Med. PSF', sortable: true, width: 'w-20', align: 'right' },
  ];

  return (
    <div id="hot-projects-table" className={`bg-white ${compact ? '' : 'rounded-lg border border-[#94B4C1]/50'} overflow-hidden`}>
      {/* Header - conditionally shown */}
      {showHeader && (
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
              onClick={(e) => { e.preventDefault(); handleRefresh(); }}
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
      )}

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
        ) : sortedData.length === 0 ? (
          <div className="text-center py-8 text-[#547792] text-sm">
            No active projects found.
          </div>
        ) : (
          sortedData.map((project, idx) => (
            <div key={project.project_name || idx} className="p-3 bg-white rounded-lg border border-[#94B4C1]/30 active:bg-[#EAE0CF]/20">
              <div className="flex justify-between items-start gap-3">
                {/* Left: Project info */}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[#213448] truncate">
                    <BlurredProject
                      value={project.project_name}
                      masked={project.project_name_masked}
                      district={project.district}
                      source="hot-projects"
                    />
                  </div>
                  <div className="text-xs text-[#547792] mt-0.5">
                    {project.district || '-'} • {project.developer || '-'}
                  </div>
                  <div className="text-xs text-[#547792] mt-0.5 flex items-center gap-2">
                    <span>{project.units_sold || 0}/{project.total_units || '-'} sold</span>
                    {project.percent_sold !== null && project.percent_sold !== undefined && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${getPercentClass(project.percent_sold)}`}>
                        {project.percent_sold.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {project.has_popular_school && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded mt-1">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                      </svg>
                      Popular School
                    </span>
                  )}
                </div>
                {/* Right: Date, Segment, Price */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-[#547792]">
                    {project.first_new_sale ? new Date(project.first_new_sale).toLocaleDateString('en-SG', { year: 'numeric', month: 'short' }) : '-'}
                  </div>
                  <span className={`inline-block mt-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${getRegionBadgeClass(project.market_segment)}`}>
                    {project.market_segment || '-'}
                  </span>
                  <div className="text-xs text-[#213448] font-medium mt-1">
                    <SuppressedValue
                      value={project.median_psf}
                      suppressed={project.suppressed || (project.units_sold || 0) < 15}
                      kRequired={15}
                      formatter={(v) => (
                        <>
                          <BlurredCurrency value={v} masked={project.median_psf_masked} field="PSF" source="hot-projects" />
                          {' PSF'}
                        </>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))
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
                    {/* Launch Date */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-sm">
                      {project.first_new_sale ? (
                        new Date(project.first_new_sale).toLocaleDateString('en-SG', {
                          year: 'numeric',
                          month: 'short'
                        })
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>

                    {/* Project Name with School Tag (inline) */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-slate-800 truncate max-w-[200px] text-sm">
                          <BlurredProject
                            value={project.project_name}
                            masked={project.project_name_masked}
                            district={project.district}
                            source="hot-projects"
                          />
                        </span>
                        {project.has_popular_school && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded whitespace-nowrap w-fit">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                            </svg>
                            <span>Popular School</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Developer */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <span className="text-slate-600 truncate max-w-[150px] block text-sm" title={project.developer}>
                        {project.developer || <span className="text-slate-400 italic">-</span>}
                      </span>
                    </td>

                    {/* Location / District - simplified */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <div className="flex flex-col">
                        <span className="text-slate-600 text-sm">{project.district || '-'}</span>
                      </div>
                    </td>

                    {/* Market Segment */}
                    <td className="px-3 py-2 border-b border-slate-100">
                      <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${getRegionBadgeClass(project.market_segment)}`}>
                        {project.market_segment || '-'}
                      </span>
                    </td>

                    {/* Total Units */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right text-sm">
                      {project.total_units?.toLocaleString() || (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>

                    {/* Units Sold */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right text-sm">
                      {project.units_sold?.toLocaleString() || '0'}
                    </td>

                    {/* % Sold with color coding */}
                    <td className="px-3 py-2 border-b border-slate-100 text-right">
                      {project.percent_sold !== null && project.percent_sold !== undefined ? (
                        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${getPercentClass(project.percent_sold)}`}>
                          {project.percent_sold.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm italic">-</span>
                      )}
                    </td>

                    {/* Unsold Inventory */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right text-sm">
                      {project.unsold_inventory !== null && project.unsold_inventory !== undefined ? (
                        project.unsold_inventory.toLocaleString()
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>

                    {/* Median Price - K-anonymity suppressed if units_sold < 15 */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right text-sm">
                      <SuppressedValue
                        value={project.median_price}
                        suppressed={project.suppressed || (project.units_sold || 0) < 15}
                        kRequired={15}
                        formatter={(v) => (
                          <BlurredCurrency
                            value={v}
                            masked={project.median_price_masked}
                            field="median price"
                            source="hot-projects"
                          />
                        )}
                      />
                    </td>

                    {/* Median PSF - K-anonymity suppressed if units_sold < 15 */}
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right text-sm">
                      <SuppressedValue
                        value={project.median_psf}
                        suppressed={project.suppressed || (project.units_sold || 0) < 15}
                        kRequired={15}
                        formatter={(v) => (
                          <BlurredCurrency
                            value={v}
                            masked={project.median_psf_masked}
                            field="median PSF"
                            source="hot-projects"
                          />
                        )}
                      />
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

export default HotProjectsTable;
