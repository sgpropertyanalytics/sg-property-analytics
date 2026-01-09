/**
 * Supply Breakdown Table
 *
 * Shows detailed breakdown of supply pipeline by district and project.
 * Collapsible rows grouped by district.
 *
 * Columns: District | Region | Total | Unsold | Upcoming | GLS
 *
 * PERFORMANCE: Uses shared SupplyDataContext to eliminate duplicate API calls.
 *
 * Styled to match FloorLiquidityHeatmap for consistency.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useSupplyData } from '../../context/SupplyDataContext';
import { ChartFrame } from '../common/ChartFrame';
import { DISTRICT_NAMES, getRegionForDistrict, getRegionBadgeClass } from '../../constants';
import { WATERFALL } from '../../constants/colors';
import { SupplyField, getSupplyField } from '../../schemas/apiContract';

// Map WATERFALL keys to simpler names for this component
const COLORS = {
  unsold: WATERFALL.unsoldInventory,
  upcoming: WATERFALL.upcomingLaunches,
  gls: WATERFALL.glsPipeline,
};

/**
 * Supply Breakdown Table Component
 */
export function SupplyBreakdownTable({
  selectedRegion = null,
  // Props kept for documentation but values come from shared context
  includeGls: _includeGls,
  launchYear: _launchYear,
}) {
  // Collapsible state
  const [expandedDistricts, setExpandedDistricts] = useState(new Set());

  // Sort state
  const [sortConfig, setSortConfig] = useState({ column: 'district', order: 'asc' });

  // Consume shared data from context (single fetch for all supply components)
  // isBootPending = true while waiting for app boot (auth/subscription/filters)
  const { data: apiResponse, loading, error, refetch, includeGls } = useSupplyData();

  // Process data into table format
  const tableData = useMemo(() => {
    const byDistrict = getSupplyField(apiResponse, SupplyField.BY_DISTRICT);
    if (!byDistrict) return { districts: [], totals: null };

    const byRegion = getSupplyField(apiResponse, SupplyField.BY_REGION) || {};
    const totals = getSupplyField(apiResponse, SupplyField.TOTALS) || {};

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
      } else if (sortConfig.column === 'region') {
        aVal = getRegionForDistrict(a.district);
        bVal = getRegionForDistrict(b.district);
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
        <svg className="w-3 h-3 text-brand-sky" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortConfig.order === 'asc' ? (
      <svg className="w-3 h-3 text-brand-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-brand-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <ChartFrame
      loading={loading}
      error={error}
      onRetry={refetch}
      empty={tableData.districts.length === 0}
      skeleton="table"
    >
      <div className="weapon-card hud-corner weapon-shadow overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-mono-muted">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-lg text-brand-navy">Supply Pipeline Breakdown</h3>
              <p className="text-sm text-brand-blue mt-0.5">
                {selectedRegion || 'All Regions'} • {tableData.districts.length} districts
              </p>
            </div>
            {/* Mini legend for bar colors */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.unsold }} />
                <span className="text-brand-blue">Unsold</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.upcoming }} />
                <span className="text-brand-blue">Upcoming</span>
              </div>
              {includeGls && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.gls }} />
                  <span className="text-brand-blue">GLS</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-w-full">
          <table className="w-full border-collapse text-xs min-w-[600px]">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th
                  className="sticky left-0 bg-brand-sand/50 text-left px-3 py-2 font-semibold text-brand-navy border-b border-r border-brand-sky/30 min-w-[320px] cursor-pointer hover:bg-brand-sand/70 select-none"
                  onClick={() => handleSort('district')}
                >
                  <div className="flex items-center gap-1">
                    <span>District</span>
                    <SortIcon column="district" />
                  </div>
                </th>
                <th
                  className="bg-brand-sand/50 text-center px-2 py-2 font-semibold text-brand-navy border-b border-r border-brand-sky/30 min-w-[60px] cursor-pointer hover:bg-brand-sand/70 select-none"
                  onClick={() => handleSort('region')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Region</span>
                    <SortIcon column="region" />
                  </div>
                </th>
                <th
                  className="bg-brand-sand/50 text-center px-2 py-2 font-semibold text-brand-navy border-b border-r border-brand-sky/30 min-w-[100px] cursor-pointer hover:bg-brand-sand/70 select-none"
                  onClick={() => handleSort('total')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Total</span>
                    <SortIcon column="total" />
                  </div>
                </th>
                <th
                  className="bg-brand-sand/50 text-right px-3 py-2 font-medium text-brand-navy border-b border-brand-sky/30 min-w-[80px] cursor-pointer hover:bg-brand-sand/70 select-none"
                  onClick={() => handleSort('unsold')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Unsold</span>
                    <SortIcon column="unsold" />
                  </div>
                </th>
                <th
                  className="bg-brand-sand/50 text-right px-3 py-2 font-medium text-brand-navy border-b border-brand-sky/30 min-w-[80px] cursor-pointer hover:bg-brand-sand/70 select-none"
                  onClick={() => handleSort('upcoming')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Upcoming</span>
                    <SortIcon column="upcoming" />
                  </div>
                </th>
                {includeGls && (
                  <th
                    className="bg-brand-sand/50 text-right px-3 py-2 font-medium text-brand-navy border-b border-brand-sky/30 min-w-[80px] cursor-pointer hover:bg-brand-sand/70 select-none"
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
                      className="bg-brand-blue/10 cursor-pointer hover:bg-brand-blue/20 transition-colors"
                      onClick={() => toggleDistrict(row.district)}
                    >
                      {/* District */}
                      <td className="sticky left-0 bg-brand-blue/10 px-3 py-1.5 font-semibold text-brand-navy border-r border-brand-sky/30">
                        <div className="flex items-center gap-2">
                          {hasProjects ? (
                            <svg
                              className={`w-3 h-3 text-brand-blue transition-transform ${isExpanded ? 'rotate-90' : ''}`}
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
                          <span className="text-brand-blue font-normal">–</span>
                          <span className="text-brand-blue font-normal truncate">
                            {areaName}
                          </span>
                        </div>
                      </td>

                      {/* Region */}
                      <td className="px-2 py-1.5 border-r border-brand-sky/30 bg-brand-blue/10 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${getRegionBadgeClass(getRegionForDistrict(row.district))}`}>
                          {getRegionForDistrict(row.district)}
                        </span>
                      </td>

                      {/* Total with Bar */}
                      <td className="px-2 py-1.5 border-r border-brand-sky/30 bg-brand-blue/10">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden flex">
                            {/* Unsold segment */}
                            {row.unsold > 0 && (
                              <div
                                className="h-full rounded-l"
                                style={{
                                  width: `${(row.unsold / tableData.maxTotal) * 100}%`,
                                  backgroundColor: COLORS.unsold
                                }}
                              />
                            )}
                            {/* Upcoming segment */}
                            {row.upcoming > 0 && (
                              <div
                                className={`h-full ${row.unsold === 0 ? 'rounded-l' : ''}`}
                                style={{
                                  width: `${(row.upcoming / tableData.maxTotal) * 100}%`,
                                  backgroundColor: COLORS.upcoming
                                }}
                              />
                            )}
                            {/* GLS segment */}
                            {includeGls && row.gls > 0 && (
                              <div
                                className={`h-full rounded-r ${row.unsold === 0 && row.upcoming === 0 ? 'rounded-l' : ''}`}
                                style={{
                                  width: `${(row.gls / tableData.maxTotal) * 100}%`,
                                  backgroundColor: COLORS.gls
                                }}
                              />
                            )}
                          </div>
                          <span className="text-[10px] text-brand-navy font-mono tabular-nums font-semibold w-10 text-right">
                            {formatNum(row.total)}
                          </span>
                        </div>
                      </td>

                      {/* Unsold */}
                      <td className="text-right px-3 py-1.5 font-mono tabular-nums bg-brand-blue/10 text-brand-navy">
                        {formatNum(row.unsold)}
                      </td>

                      {/* Upcoming */}
                      <td className="text-right px-3 py-1.5 font-mono tabular-nums bg-brand-blue/10 text-brand-navy">
                        {formatNum(row.upcoming)}
                      </td>

                      {/* GLS */}
                      {includeGls && (
                        <td className="text-right px-3 py-1.5 font-mono tabular-nums bg-brand-blue/10 text-brand-navy">
                          {formatNum(row.gls)}
                        </td>
                      )}
                    </tr>

                    {/* Project Rows (when expanded) */}
                    {isExpanded && hasProjects && row.projects.map((project, pIdx) => (
                      <tr
                        key={`${row.district}-${pIdx}`}
                        className={pIdx % 2 === 0 ? 'bg-white' : 'bg-brand-sand/10'}
                      >
                        {/* Project Name */}
                        <td className={`sticky left-0 ${pIdx % 2 === 0 ? 'bg-white' : 'bg-brand-sand/10'} pl-8 pr-3 py-1 text-xs font-medium text-brand-navy border-r border-brand-sky/30`}>
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
                              <span className="text-[9px] text-brand-sky shrink-0">
                                {project.launch_quarter}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Region - empty for project rows */}
                        <td className={`${pIdx % 2 === 0 ? 'bg-white' : 'bg-brand-sand/10'} px-2 py-1 border-r border-brand-sky/30`} />

                        {/* Project Total */}
                        <td className={`${pIdx % 2 === 0 ? 'bg-white' : 'bg-brand-sand/10'} px-2 py-1 border-r border-brand-sky/30 text-center`}>
                          <span className="text-[10px] text-brand-blue font-mono tabular-nums">
                            {formatNum(project.units)}
                          </span>
                        </td>

                        {/* Unsold column */}
                        <td className="text-right px-3 py-1 font-mono tabular-nums text-[11px] text-brand-navy">
                          {project.category === 'unsold' ? formatNum(project.units) : '–'}
                        </td>

                        {/* Upcoming column */}
                        <td className="text-right px-3 py-1 font-mono tabular-nums text-[11px] text-brand-navy">
                          {project.category === 'upcoming' ? formatNum(project.units) : '–'}
                        </td>

                        {/* GLS column */}
                        {includeGls && (
                          <td className="text-right px-3 py-1 font-mono tabular-nums text-[11px] text-brand-navy">
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
                <tr className="bg-brand-navy text-white font-semibold">
                  <td className="sticky left-0 bg-brand-navy px-3 py-2.5 border-t border-brand-blue">
                    TOTAL
                  </td>
                  <td className="px-2 py-2.5 border-t border-brand-blue" />
                  <td className="px-2 py-2.5 font-mono tabular-nums border-t border-brand-blue text-center">
                    {formatNum(tableData.totals.totalEffectiveSupply)}
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono tabular-nums border-t border-brand-blue">
                    {formatNum(tableData.totals.unsoldInventory)}
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono tabular-nums border-t border-brand-blue">
                    {formatNum(tableData.totals.upcomingLaunches)}
                  </td>
                  {includeGls && (
                    <td className="text-right px-3 py-2.5 font-mono tabular-nums border-t border-brand-blue">
                      {formatNum(tableData.totals.glsPipeline)}
                    </td>
                  )}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ChartFrame>
  );
}

export default SupplyBreakdownTable;
