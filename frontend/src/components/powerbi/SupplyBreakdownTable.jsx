/**
 * Supply Breakdown Table
 *
 * Shows detailed breakdown of supply pipeline by district and project.
 * Collapsible rows grouped by district.
 *
 * Columns: District | Total | Unsold | Upcoming | GLS
 *
 * Styled to match FloorLiquidityHeatmap for consistency.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import { getSupplySummary } from '../../api/client';
import { DISTRICT_NAMES } from '../../constants';

// Colors from design system
const COLORS = {
  unsold: '#213448',    // Navy
  upcoming: '#547792',  // Blue
  gls: '#94B4C1',       // Sky
};

/**
 * Supply Breakdown Table Component
 */
export function SupplyBreakdownTable({
  selectedRegion = null,
  includeGls = true,
  launchYear = 2026,
}) {
  // Collapsible state
  const [expandedDistricts, setExpandedDistricts] = useState(new Set());

  // Sort state
  const [sortConfig, setSortConfig] = useState({ column: 'district', order: 'asc' });

  // Build filter key for caching
  const filterKey = useMemo(() =>
    `${selectedRegion || 'all'}:${includeGls}:${launchYear}`,
    [selectedRegion, includeGls, launchYear]
  );

  // Fetch supply data
  const { data: apiResponse, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const params = { includeGls, launchYear };
      const response = await getSupplySummary(params, { signal });
      return response.data;
    },
    [filterKey],
    { initialData: null }
  );

  // Process data into table format
  const tableData = useMemo(() => {
    if (!apiResponse?.byDistrict) return { districts: [], totals: null };

    const { byDistrict, byRegion, totals } = apiResponse;

    // Filter by selected region if specified
    const filteredDistricts = Object.entries(byDistrict)
      .filter(([, data]) => !selectedRegion || data.region === selectedRegion)
      .sort(([a], [b]) => a.localeCompare(b));

    // Group by region for subtotals, include projects
    const districts = filteredDistricts.map(([district, data]) => ({
      district,
      region: data.region,
      unsold: data.unsoldInventory || 0,
      upcoming: data.upcomingLaunches || 0,
      gls: data.glsPipeline || 0,
      total: data.totalEffectiveSupply || 0,
      projects: data.projects || [],
    }));

    // Calculate max for bar scaling
    const maxTotal = Math.max(...districts.map(d => d.total), 1);

    return {
      districts,
      totals: selectedRegion ? byRegion?.[selectedRegion] : totals,
      maxTotal,
    };
  }, [apiResponse, selectedRegion]);

  // Start collapsed by default
  useEffect(() => {
    if (tableData.districts.length > 0) {
      setExpandedDistricts(new Set());
    }
  }, [tableData.districts.length]);

  // Toggle district expansion
  const toggleDistrict = (district) => {
    setExpandedDistricts(prev => {
      const next = new Set(prev);
      if (next.has(district)) {
        next.delete(district);
      } else {
        next.add(district);
      }
      return next;
    });
  };

  // Expand/collapse all
  const expandAll = () => setExpandedDistricts(new Set(tableData.districts.map(d => d.district)));
  const collapseAll = () => setExpandedDistricts(new Set());

  // Format number with commas
  const formatNum = (n) => n?.toLocaleString() || '0';

  // Get full area name for district
  const getAreaName = (district) => {
    return DISTRICT_NAMES[district] || '';
  };

  // Sort handler
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'desc' ? 'asc' : 'desc'
    }));
  };

  // Sort districts based on sortConfig
  const sortedDistricts = useMemo(() => {
    const sorted = [...tableData.districts];
    sorted.sort((a, b) => {
      let aVal, bVal;
      if (sortConfig.column === 'district') {
        aVal = a.district;
        bVal = b.district;
      } else {
        aVal = a[sortConfig.column] ?? 0;
        bVal = b[sortConfig.column] ?? 0;
      }
      if (typeof aVal === 'string') {
        return sortConfig.order === 'desc'
          ? bVal.localeCompare(aVal)
          : aVal.localeCompare(bVal);
      }
      return sortConfig.order === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [tableData.districts, sortConfig]);

  // Sort icon component
  const SortIcon = ({ column }) => {
    if (sortConfig.column !== column) {
      return (
        <svg className="w-3 h-3 text-[#94B4C1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortConfig.order === 'asc' ? (
      <svg className="w-3 h-3 text-[#213448]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-[#213448]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <QueryState
      loading={loading}
      error={error}
      onRetry={refetch}
      empty={tableData.districts.length === 0}
      skeleton="table"
    >
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#94B4C1]/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-bold text-lg text-[#213448]">Supply Pipeline Breakdown</h3>
              <p className="text-sm text-[#547792] mt-0.5">
                {selectedRegion || 'All Regions'} • {tableData.districts.length} districts
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={expandAll}
                className="px-2 py-1 text-xs text-[#547792] hover:bg-[#EAE0CF]/50 rounded transition-colors"
                title="Expand all districts"
              >
                Expand All
              </button>
              <span className="text-[#547792]">|</span>
              <button
                onClick={collapseAll}
                className="px-2 py-1 text-xs text-[#547792] hover:bg-[#EAE0CF]/50 rounded transition-colors"
                title="Collapse all districts"
              >
                Collapse
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="text-[#547792] font-medium">Supply:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded" style={{ backgroundColor: COLORS.unsold }} />
              <span className="text-[#213448]">Unsold Inventory</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded" style={{ backgroundColor: COLORS.upcoming }} />
              <span className="text-[#547792]">Upcoming Launches</span>
            </div>
            {includeGls && (
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: COLORS.gls }} />
                <span className="text-[#547792]">GLS Pipeline</span>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-w-full">
          <table className="w-full border-collapse text-xs min-w-[600px]">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th
                  className="sticky left-0 bg-[#EAE0CF]/50 text-left px-3 py-2 font-semibold text-[#213448] border-b border-r border-[#94B4C1]/30 min-w-[320px] cursor-pointer hover:bg-[#EAE0CF]/70 select-none"
                  onClick={() => handleSort('district')}
                >
                  <div className="flex items-center gap-1">
                    <span>District</span>
                    <SortIcon column="district" />
                  </div>
                </th>
                <th
                  className="bg-[#EAE0CF]/50 text-center px-2 py-2 font-semibold text-[#213448] border-b border-r border-[#94B4C1]/30 min-w-[100px] cursor-pointer hover:bg-[#EAE0CF]/70 select-none"
                  onClick={() => handleSort('total')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Total</span>
                    <SortIcon column="total" />
                  </div>
                </th>
                <th
                  className="bg-[#EAE0CF]/50 text-right px-3 py-2 font-medium text-[#213448] border-b border-[#94B4C1]/30 min-w-[80px] cursor-pointer hover:bg-[#EAE0CF]/70 select-none"
                  onClick={() => handleSort('unsold')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Unsold</span>
                    <SortIcon column="unsold" />
                  </div>
                </th>
                <th
                  className="bg-[#EAE0CF]/50 text-right px-3 py-2 font-medium text-[#547792] border-b border-[#94B4C1]/30 min-w-[80px] cursor-pointer hover:bg-[#EAE0CF]/70 select-none"
                  onClick={() => handleSort('upcoming')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Upcoming</span>
                    <SortIcon column="upcoming" />
                  </div>
                </th>
                {includeGls && (
                  <th
                    className="bg-[#EAE0CF]/50 text-right px-3 py-2 font-medium text-[#94B4C1] border-b border-[#94B4C1]/30 min-w-[80px] cursor-pointer hover:bg-[#EAE0CF]/70 select-none"
                    onClick={() => handleSort('gls')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>GLS</span>
                      <SortIcon column="gls" />
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedDistricts.map((row) => {
                const isExpanded = expandedDistricts.has(row.district);
                const hasProjects = row.projects && row.projects.length > 0;
                const areaName = getAreaName(row.district);

                return (
                  <React.Fragment key={row.district}>
                    {/* District Header Row */}
                    <tr
                      className="bg-[#547792]/10 cursor-pointer hover:bg-[#547792]/20 transition-colors"
                      onClick={() => toggleDistrict(row.district)}
                    >
                      {/* District */}
                      <td className="sticky left-0 bg-[#547792]/10 px-3 py-1.5 font-semibold text-[#213448] border-r border-[#94B4C1]/30">
                        <div className="flex items-center gap-2">
                          {hasProjects ? (
                            <svg
                              className={`w-3 h-3 text-[#547792] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          ) : (
                            <div className="w-3 h-3" />
                          )}
                          <span>{row.district}</span>
                          <span className="text-[#547792] font-normal">–</span>
                          <span className="text-[#547792] font-normal truncate">
                            {areaName}
                          </span>
                        </div>
                      </td>

                      {/* Total with Bar - Now second column */}
                      <td className="px-2 py-1.5 border-r border-[#94B4C1]/30 bg-[#547792]/10">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${(row.total / tableData.maxTotal) * 100}%`,
                                background: `linear-gradient(to right, ${COLORS.unsold}, ${COLORS.upcoming})`
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-[#213448] font-mono font-semibold w-10 text-right">
                            {formatNum(row.total)}
                          </span>
                        </div>
                      </td>

                      {/* Unsold */}
                      <td className="text-right px-3 py-1.5 font-mono bg-[#547792]/10" style={{ color: COLORS.unsold }}>
                        {formatNum(row.unsold)}
                      </td>

                      {/* Upcoming */}
                      <td className="text-right px-3 py-1.5 font-mono bg-[#547792]/10" style={{ color: COLORS.upcoming }}>
                        {formatNum(row.upcoming)}
                      </td>

                      {/* GLS */}
                      {includeGls && (
                        <td className="text-right px-3 py-1.5 font-mono bg-[#547792]/10" style={{ color: COLORS.gls }}>
                          {formatNum(row.gls)}
                        </td>
                      )}
                    </tr>

                    {/* Project Rows (when expanded) */}
                    {isExpanded && hasProjects && row.projects.map((project, pIdx) => (
                      <tr
                        key={`${row.district}-${pIdx}`}
                        className={pIdx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'}
                      >
                        {/* Project Name */}
                        <td className={`sticky left-0 ${pIdx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'} pl-8 pr-3 py-1 text-xs font-medium text-[#213448] border-r border-[#94B4C1]/30`}>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: project.category === 'unsold' ? COLORS.unsold : COLORS.upcoming
                              }}
                            />
                            <span className="truncate" title={project.name}>
                              {project.name}
                            </span>
                            {project.category === 'upcoming' && project.launch_quarter && (
                              <span className="text-[9px] text-[#94B4C1] shrink-0">
                                {project.launch_quarter}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Project Total */}
                        <td className={`${pIdx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'} px-2 py-1 border-r border-[#94B4C1]/30 text-center`}>
                          <span className="text-[10px] text-[#547792] font-mono">
                            {formatNum(project.units)}
                          </span>
                        </td>

                        {/* Unsold column */}
                        <td className="text-right px-3 py-1 font-mono text-[11px]" style={{ color: COLORS.unsold }}>
                          {project.category === 'unsold' ? formatNum(project.units) : '–'}
                        </td>

                        {/* Upcoming column */}
                        <td className="text-right px-3 py-1 font-mono text-[11px]" style={{ color: COLORS.upcoming }}>
                          {project.category === 'upcoming' ? formatNum(project.units) : '–'}
                        </td>

                        {/* GLS column */}
                        {includeGls && (
                          <td className="text-right px-3 py-1 font-mono text-[11px] text-[#94B4C1]">
                            –
                          </td>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}

              {/* Totals Row */}
              {tableData.totals && (
                <tr className="bg-[#213448] text-white font-semibold">
                  <td className="sticky left-0 bg-[#213448] px-3 py-2.5 border-t border-[#547792]">
                    TOTAL
                  </td>
                  <td className="px-2 py-2.5 font-mono border-t border-[#547792] text-center">
                    {formatNum(tableData.totals.totalEffectiveSupply)}
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono border-t border-[#547792]">
                    {formatNum(tableData.totals.unsoldInventory)}
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono border-t border-[#547792]">
                    {formatNum(tableData.totals.upcomingLaunches)}
                  </td>
                  {includeGls && (
                    <td className="text-right px-3 py-2.5 font-mono border-t border-[#547792]">
                      {formatNum(tableData.totals.glsPipeline)}
                    </td>
                  )}
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
            <span className="text-[#94B4C1]">
              Launch Year: {launchYear} • Click district to see projects
            </span>
            <span className="text-[#94B4C1]">
              Higher bar = More supply
            </span>
          </div>
        </div>
      </div>
    </QueryState>
  );
}

export default SupplyBreakdownTable;
