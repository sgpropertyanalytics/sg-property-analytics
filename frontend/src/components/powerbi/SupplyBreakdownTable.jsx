/**
 * Supply Breakdown Table
 *
 * Shows detailed breakdown of supply pipeline by district and project.
 * Collapsible rows grouped by district.
 *
 * Columns: District/Project | Unsold | Upcoming | GLS | Total
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import { getSupplySummary } from '../../api/client';

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
  height = 400,
}) {
  // Collapsible state - all expanded by default
  const [expandedDistricts, setExpandedDistricts] = useState(new Set());

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
      projects: data.projects || [],  // Include project-level data
    }));

    // Calculate max for bar scaling
    const maxTotal = Math.max(...districts.map(d => d.total), 1);

    return {
      districts,
      totals: selectedRegion ? byRegion?.[selectedRegion] : totals,
      maxTotal,
    };
  }, [apiResponse, selectedRegion]);

  // Start collapsed by default (less overwhelming with projects)
  useEffect(() => {
    if (tableData.districts.length > 0) {
      setExpandedDistricts(new Set());  // Start collapsed
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

  return (
    <QueryState
      loading={loading}
      error={error}
      onRetry={refetch}
      empty={tableData.districts.length === 0}
      skeleton="table"
      height={height}
    >
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden" style={{ height }}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#213448] text-sm md:text-base">
                Supply Pipeline Breakdown
              </h3>
              <p className="text-xs text-[#547792] mt-0.5">
                {selectedRegion || 'All Regions'} • {tableData.districts.length} districts
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Expand/Collapse */}
              <button
                onClick={expandAll}
                className="px-2 py-1 text-xs text-[#547792] hover:bg-[#EAE0CF]/50 rounded"
              >
                Expand
              </button>
              <span className="text-[#94B4C1]">|</span>
              <button
                onClick={collapseAll}
                className="px-2 py-1 text-xs text-[#547792] hover:bg-[#EAE0CF]/50 rounded"
              >
                Collapse
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.unsold }} />
            <span className="text-[#213448]">Unsold Inventory</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.upcoming }} />
            <span className="text-[#547792]">Upcoming Launches</span>
          </div>
          {includeGls && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.gls }} />
              <span className="text-[#547792]">GLS Pipeline</span>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1" style={{ maxHeight: height - 140 }}>
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="sticky left-0 bg-[#EAE0CF]/50 text-left px-3 py-2 font-semibold text-[#213448] border-b border-[#94B4C1]/30 min-w-[120px]">
                  District
                </th>
                <th className="bg-[#EAE0CF]/50 text-right px-3 py-2 font-medium text-[#213448] border-b border-[#94B4C1]/30 min-w-[80px]">
                  Unsold
                </th>
                <th className="bg-[#EAE0CF]/50 text-right px-3 py-2 font-medium text-[#547792] border-b border-[#94B4C1]/30 min-w-[80px]">
                  Upcoming
                </th>
                {includeGls && (
                  <th className="bg-[#EAE0CF]/50 text-right px-3 py-2 font-medium text-[#94B4C1] border-b border-[#94B4C1]/30 min-w-[80px]">
                    GLS
                  </th>
                )}
                <th className="bg-[#EAE0CF]/50 text-right px-3 py-2 font-semibold text-[#213448] border-b border-[#94B4C1]/30 min-w-[100px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {tableData.districts.map((row, idx) => {
                const isExpanded = expandedDistricts.has(row.district);
                const barWidth = (row.total / tableData.maxTotal) * 100;
                const hasProjects = row.projects && row.projects.length > 0;

                return (
                  <React.Fragment key={row.district}>
                    {/* District Row */}
                    <tr
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'} hover:bg-[#547792]/10 cursor-pointer transition-colors`}
                      onClick={() => toggleDistrict(row.district)}
                    >
                      {/* District */}
                      <td className={`sticky left-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'} px-3 py-2 font-medium text-[#213448] border-r border-[#94B4C1]/20`}>
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
                          <span className="text-[10px] text-[#94B4C1] font-normal">({row.region})</span>
                        </div>
                      </td>

                      {/* Unsold */}
                      <td className="text-right px-3 py-2 font-mono" style={{ color: COLORS.unsold }}>
                        {formatNum(row.unsold)}
                      </td>

                      {/* Upcoming */}
                      <td className="text-right px-3 py-2 font-mono" style={{ color: COLORS.upcoming }}>
                        {formatNum(row.upcoming)}
                      </td>

                      {/* GLS */}
                      {includeGls && (
                        <td className="text-right px-3 py-2 font-mono" style={{ color: COLORS.gls }}>
                          {formatNum(row.gls)}
                        </td>
                      )}

                      {/* Total with bar */}
                      <td className="text-right px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${barWidth}%`,
                                background: `linear-gradient(to right, ${COLORS.unsold}, ${COLORS.upcoming})`
                              }}
                            />
                          </div>
                          <span className="font-mono font-semibold text-[#213448] min-w-[50px]">
                            {formatNum(row.total)}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Project Rows (when expanded) */}
                    {isExpanded && hasProjects && row.projects.map((project, pIdx) => (
                      <tr
                        key={`${row.district}-${pIdx}`}
                        className="bg-[#EAE0CF]/5 text-[11px]"
                      >
                        {/* Project Name */}
                        <td className="sticky left-0 bg-[#EAE0CF]/5 px-3 py-1.5 border-r border-[#94B4C1]/20">
                          <div className="flex items-center gap-2 pl-5">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: project.category === 'unsold' ? COLORS.unsold : COLORS.upcoming
                              }}
                            />
                            <span className="text-[#547792] truncate" title={project.name}>
                              {project.name}
                            </span>
                            {project.category === 'upcoming' && project.launch_quarter && (
                              <span className="text-[9px] text-[#94B4C1] shrink-0">
                                Q{project.launch_quarter}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Unsold column */}
                        <td className="text-right px-3 py-1.5 font-mono" style={{ color: COLORS.unsold }}>
                          {project.category === 'unsold' ? formatNum(project.units) : '–'}
                        </td>

                        {/* Upcoming column */}
                        <td className="text-right px-3 py-1.5 font-mono" style={{ color: COLORS.upcoming }}>
                          {project.category === 'upcoming' ? formatNum(project.units) : '–'}
                        </td>

                        {/* GLS column */}
                        {includeGls && (
                          <td className="text-right px-3 py-1.5 font-mono text-[#94B4C1]">
                            –
                          </td>
                        )}

                        {/* Total column */}
                        <td className="text-right px-3 py-1.5">
                          <span className="font-mono text-[#547792]">
                            {formatNum(project.units)}
                          </span>
                        </td>
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
                  <td className="text-right px-3 py-2.5 font-mono border-t border-[#547792]">
                    {formatNum(tableData.totals.totalEffectiveSupply)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-2 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 text-xs text-[#547792]">
          Launch Year: {launchYear} • Click district to see projects
        </div>
      </div>
    </QueryState>
  );
}

export default SupplyBreakdownTable;
