import React, { useEffect, useState, useMemo } from 'react';
import { useStaleRequestGuard } from '../../hooks';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getFloorLiquidityHeatmap } from '../../api/client';
import {
  FLOOR_LEVELS,
  FLOOR_RANGE_LABELS,
  LIQUIDITY_COLORS,
  getLiquidityColor,
} from '../../constants';

/**
 * Floor Liquidity Heatmap
 *
 * "Which Floors Resell Faster"
 *
 * Shows which floor zones have the highest resale velocity by project.
 * Uses Z-score normalization within each project for fair comparison.
 *
 * X-axis: Floor Zones (Low → Luxury)
 * Y-axis: Project Names (alphabetical)
 * Cell color: Liquidity Score (Z-score of velocity within project)
 */
export function FloorLiquidityHeatmap({ bedroom, segment }) {
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();

  // Local state for window toggle
  const [windowMonths, setWindowMonths] = useState(12);

  // Data state
  const [data, setData] = useState({ projects: [], floor_zone_order: [] });
  const [meta, setMeta] = useState({ exclusions: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Prevent stale responses from overwriting fresh data
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Collapsible district state
  const [expandedDistricts, setExpandedDistricts] = useState(new Set());

  // Tooltip state
  const [hoveredCell, setHoveredCell] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Group projects by district and calculate district-level aggregations
  const projectsByDistrict = useMemo(() => {
    const grouped = {};
    const districtAggregates = {};

    // Group projects
    for (const project of data.projects) {
      const district = project.district || 'Unknown';
      if (!grouped[district]) {
        grouped[district] = [];
      }
      grouped[district].push(project);
    }

    // Calculate district-level aggregates
    for (const [district, projects] of Object.entries(grouped)) {
      // Sum counts per floor zone across all projects
      const zoneTotals = {};
      for (const project of projects) {
        for (const [zone, zoneData] of Object.entries(project.floor_zones || {})) {
          if (!zoneTotals[zone]) {
            zoneTotals[zone] = { count: 0 };
          }
          zoneTotals[zone].count += zoneData.count || 0;
        }
      }

      // Calculate velocities and Z-scores for district
      const velocities = [];
      for (const [zone, totals] of Object.entries(zoneTotals)) {
        totals.velocity = totals.count / windowMonths;
        velocities.push(totals.velocity);
      }

      // Calculate Z-scores if we have multiple zones
      if (velocities.length >= 2) {
        const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
        const variance = velocities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / velocities.length;
        const std = Math.sqrt(variance);

        for (const [zone, totals] of Object.entries(zoneTotals)) {
          if (std > 0) {
            totals.z_score = (totals.velocity - mean) / std;
          } else {
            totals.z_score = 0;
          }
        }
      } else {
        for (const totals of Object.values(zoneTotals)) {
          totals.z_score = 0;
        }
      }

      // Calculate total transactions for the district
      const totalTxns = Object.values(zoneTotals).reduce((sum, z) => sum + z.count, 0);
      districtAggregates[district] = { zones: zoneTotals, totalTxns };
    }

    // Sort districts by total transactions (highest first)
    const sortedDistricts = Object.keys(grouped).sort((a, b) => {
      const txnsA = districtAggregates[a]?.totalTxns || 0;
      const txnsB = districtAggregates[b]?.totalTxns || 0;
      return txnsB - txnsA; // Descending order
    });

    // Calculate max volume for bar scaling
    const maxVolume = Math.max(...Object.values(districtAggregates).map(d => d.totalTxns || 0), 1);

    return { grouped, sortedDistricts, districtAggregates, maxVolume };
  }, [data.projects, windowMonths]);

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
  const expandAll = () => setExpandedDistricts(new Set(projectsByDistrict.sortedDistricts));
  const collapseAll = () => setExpandedDistricts(new Set());

  // Fetch data
  useEffect(() => {
    const requestId = startRequest();
    const signal = getSignal();

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = buildApiParams({
          window_months: windowMonths
        });
        if (bedroom) params.bedroom = bedroom;
        if (segment) params.segment = segment;

        const response = await getFloorLiquidityHeatmap(params, { signal });

        // Ignore stale responses - a newer request has started
        if (isStale(requestId)) return;

        setData(response.data?.data || { projects: [], floor_zone_order: [] });
        setMeta(response.data?.meta || { exclusions: {} });
      } catch (err) {
        // Ignore abort errors - expected when request is cancelled
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        if (isStale(requestId)) return;
        console.error('Error fetching heatmap data:', err);
        setError(err.message);
      } finally {
        if (!isStale(requestId)) {
          setLoading(false);
        }
      }
    };

    fetchData();
    // debouncedFilterKey delays fetch by 200ms to prevent rapid-fire requests
    // buildApiParams/getSignal/startRequest/isStale are stable functions from context/hooks
  }, [debouncedFilterKey, windowMonths, bedroom, segment, buildApiParams, getSignal, startRequest, isStale]);

  // Floor zones to display
  const floorZones = data.floor_zone_order?.length > 0
    ? data.floor_zone_order
    : FLOOR_LEVELS;

  // Handle cell hover
  const handleCellHover = (e, project, zone, zoneData) => {
    const rect = e.target.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    setHoveredCell({ project, zone, zoneData });
  };

  const handleCellLeave = () => {
    setHoveredCell(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: 200 }}>
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#547792]">Loading liquidity data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: 200 }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (data.projects.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: 200 }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-[#547792]">No resale data available for current filters</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-bold text-lg text-[#213448]">Which Floors Resell Faster</h3>
            <p className="text-sm text-[#547792] mt-0.5">
              Z-score normalized resale velocity by project ({data.projects.length} projects)
            </p>
            {/* Z-score explanation */}
            <div className="mt-1 flex items-center gap-1.5 group relative">
              <svg className="w-3.5 h-3.5 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-[#547792] cursor-help">What is Z-score?</span>
              {/* Tooltip */}
              <div className="absolute left-0 top-full mt-1 w-72 p-3 bg-[#213448] text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <p className="font-medium mb-2">Z-score measures relative liquidity within each project:</p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-blue-300">+1.0 or higher</span><span>Sells much faster than avg</span></div>
                  <div className="flex justify-between"><span className="text-gray-300">0.0</span><span>Average speed for this project</span></div>
                  <div className="flex justify-between"><span className="text-blue-100">-1.0 or lower</span><span>Sells much slower than avg</span></div>
                </div>
                <p className="mt-2 text-[10px] text-[#547792]">Normalizes across projects of different sizes for fair comparison.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Expand/Collapse All */}
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

            {/* Window Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#547792] font-medium">Window:</span>
              {[6, 12, 24].map((months) => (
                <button
                  key={months}
                  onClick={() => setWindowMonths(months)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    windowMonths === months
                      ? 'bg-[#213448] text-white'
                      : 'bg-[#EAE0CF]/50 text-[#547792] hover:bg-[#EAE0CF]'
                  }`}
                >
                  {months}M
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="text-[#547792] font-medium">Liquidity:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_COLORS.very_liquid }} />
            <span className="text-[#213448]">Very Liquid</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_COLORS.liquid }} />
            <span className="text-[#547792]">Liquid</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_COLORS.neutral }} />
            <span className="text-[#547792]">Neutral</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_COLORS.illiquid }} />
            <span className="text-[#547792]">Illiquid</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_COLORS.very_illiquid }} />
            <span className="text-[#547792]">Very Illiquid</span>
          </div>
          <div className="flex items-center gap-1.5 ml-4 border-l border-[#94B4C1]/30 pl-4">
            <div className="w-4 h-3 rounded border border-dashed border-[#94B4C1]" style={{ backgroundColor: LIQUIDITY_COLORS.insufficient }} />
            <span className="text-[#547792]">n&lt;5</span>
          </div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden p-3 space-y-2 max-h-[500px] overflow-y-auto">
        {projectsByDistrict.sortedDistricts.map((district) => {
          const projects = projectsByDistrict.grouped[district];
          const isExpanded = expandedDistricts.has(district);
          const districtAgg = projectsByDistrict.districtAggregates[district];

          return (
            <div key={district} className="bg-white rounded-lg border border-[#94B4C1]/30">
              {/* District Header */}
              <button
                onClick={() => toggleDistrict(district)}
                className="w-full px-3 py-2 flex items-center justify-between bg-[#547792]/10 rounded-t-lg"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-3 h-3 text-[#547792] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-semibold text-[#213448]">{district}</span>
                  <span className="text-xs text-[#547792]">({projects.length})</span>
                </div>
                <span className="text-xs font-medium text-[#213448]">{districtAgg?.totalTxns || 0} txns</span>
              </button>

              {/* District Floor Zone Summary */}
              <div className="px-3 py-2 border-b border-[#94B4C1]/20">
                <div className="flex flex-wrap gap-1">
                  {floorZones.map((zone) => {
                    const zoneData = districtAgg?.zones?.[zone];
                    const hasData = zoneData && zoneData.count > 0;
                    const bgColor = hasData
                      ? getLiquidityColor(zoneData.z_score, zoneData.count)
                      : LIQUIDITY_COLORS.insufficient;

                    return (
                      <div
                        key={zone}
                        className="flex flex-col items-center px-2 py-1 rounded text-[10px]"
                        style={{ backgroundColor: bgColor }}
                      >
                        <span className="font-medium text-[#213448]">{zone}</span>
                        <span className="text-[#547792]">{hasData ? zoneData.count : '-'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Expanded Projects */}
              {isExpanded && (
                <div className="divide-y divide-[#94B4C1]/20">
                  {projects.map((project) => {
                    const bestZone = Object.entries(project.floor_zones || {})
                      .filter(([, d]) => d.count >= 5)
                      .sort(([, a], [, b]) => (b.z_score || 0) - (a.z_score || 0))[0];

                    return (
                      <div key={project.project_name} className="px-3 py-2">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[#213448] text-sm truncate">
                              {project.project_name}
                            </div>
                            <div className="text-xs text-[#547792]">
                              {project.total_transactions} transactions
                            </div>
                          </div>
                          {bestZone && (
                            <div className="text-right flex-shrink-0 ml-2">
                              <div className="text-[10px] text-[#547792]">Best Floor</div>
                              <div className="text-xs font-semibold text-[#213448]">
                                {bestZone[0]} <span className="text-emerald-600">+{bestZone[1].z_score?.toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Mini floor zone row */}
                        <div className="flex gap-1 mt-2">
                          {floorZones.map((zone) => {
                            const zoneData = project.floor_zones[zone];
                            const hasData = zoneData && zoneData.count > 0;
                            const bgColor = hasData
                              ? getLiquidityColor(zoneData.z_score, zoneData.count)
                              : LIQUIDITY_COLORS.insufficient;

                            return (
                              <div
                                key={zone}
                                className="flex-1 text-center py-1 rounded text-[9px]"
                                style={{ backgroundColor: bgColor }}
                              >
                                {hasData ? (zoneData.count < 5 ? 'n<5' : zoneData.z_score?.toFixed(1)) : '-'}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto max-w-full">
        <table className="w-full border-collapse text-xs min-w-[700px]">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="sticky left-0 bg-[#EAE0CF]/50 text-left px-3 py-1 font-semibold text-[#213448] border-b border-r border-[#94B4C1]/30 min-w-[180px]">
                Project
              </th>
              <th className="bg-[#EAE0CF]/50 text-center px-2 py-1 font-medium text-[#547792] border-b border-r border-[#94B4C1]/30 min-w-[80px]">
                Volume
              </th>
              {floorZones.map((zone) => (
                <th
                  key={zone}
                  className="bg-[#EAE0CF]/50 text-center px-2 py-1 font-medium border-b border-[#94B4C1]/30 min-w-[70px]"
                >
                  <div className="text-[#547792]">{zone}</div>
                  <div className="text-[10px] text-[#547792] font-normal">({FLOOR_RANGE_LABELS[zone] || '?'})</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projectsByDistrict.sortedDistricts.map((district) => {
              const projects = projectsByDistrict.grouped[district];
              const isExpanded = expandedDistricts.has(district);

              return (
                <React.Fragment key={district}>
                  {/* District Header Row - Clickable */}
                  <tr
                    className="bg-[#547792]/10 cursor-pointer hover:bg-[#547792]/20 transition-colors"
                    onClick={() => toggleDistrict(district)}
                  >
                    <td className="sticky left-0 bg-[#547792]/10 px-3 py-1.5 font-semibold text-[#213448] border-r border-[#94B4C1]/30">
                      <div className="flex items-center gap-2">
                        <svg
                          className={`w-3 h-3 text-[#547792] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span>{district}</span>
                        <span className="text-[#213448] font-normal">
                          ({projects.length} projects • {projectsByDistrict.districtAggregates[district]?.totalTxns || 0} txns)
                        </span>
                      </div>
                    </td>
                    {/* Volume Bar - Now second column */}
                    <td className="px-2 py-1.5 border-r border-[#94B4C1]/30 bg-[#547792]/10">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-[#547792] rounded"
                            style={{ width: `${(projectsByDistrict.districtAggregates[district]?.totalTxns || 0) / projectsByDistrict.maxVolume * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[#547792] font-mono w-8 text-right">
                          {projectsByDistrict.districtAggregates[district]?.totalTxns || 0}
                        </span>
                      </div>
                    </td>
                    {floorZones.map((zone) => {
                      const districtZone = projectsByDistrict.districtAggregates[district]?.zones?.[zone];
                      const districtTotal = projectsByDistrict.districtAggregates[district]?.totalTxns || 1;
                      const hasData = districtZone && districtZone.count > 0;
                      const percentage = hasData ? (districtZone.count / districtTotal * 100) : 0;
                      // Color intensity based on percentage (higher % = darker)
                      const intensity = Math.min(percentage / 40, 1); // 40% = max intensity
                      const bgColor = hasData
                        ? `rgba(84, 119, 146, ${0.15 + intensity * 0.45})`
                        : LIQUIDITY_COLORS.insufficient;

                      return (
                        <td
                          key={zone}
                          className="text-center px-1 py-1 font-semibold"
                          style={{ backgroundColor: bgColor }}
                          title={hasData ? `${zone}: ${districtZone.count} of ${districtTotal} transactions (${percentage.toFixed(1)}%)` : `${zone}: No data`}
                        >
                          {hasData ? (
                            <span className="text-[11px] font-mono text-[#213448]">
                              {districtZone.count}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Project Rows - Show when expanded */}
                  {isExpanded && projects.map((project, idx) => (
                    <tr key={project.project_name} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'}>
                      {/* Project Name (sticky) - Indented */}
                      <td className={`sticky left-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'} pl-8 pr-3 py-1 text-xs font-medium text-[#213448] border-r border-[#94B4C1]/30`}>
                        <span className="truncate" title={project.project_name}>{project.project_name}</span>
                      </td>
                      {/* Project Volume - Now second column */}
                      <td className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'} px-2 py-1 border-r border-[#94B4C1]/30 text-center`}>
                        <span className="text-[10px] text-[#547792] font-mono">
                          {project.total_transactions}
                        </span>
                      </td>

                      {/* Floor Zone Cells - Compact */}
                      {floorZones.map((zone) => {
                        const zoneData = project.floor_zones[zone];
                        const hasData = zoneData && zoneData.count > 0;
                        const isInsufficient = hasData && zoneData.count < 5;
                        const bgColor = hasData
                          ? getLiquidityColor(zoneData.z_score, zoneData.count)
                          : LIQUIDITY_COLORS.insufficient;
                        const textColor = hasData && zoneData.z_score >= 0.25 && zoneData.count >= 5
                          ? 'text-white'
                          : 'text-gray-600';

                        return (
                          <td
                            key={zone}
                            className="text-center px-1 py-1 cursor-pointer transition-all duration-100 hover:ring-2 hover:ring-[#213448] hover:ring-inset"
                            style={{
                              backgroundColor: bgColor,
                              opacity: isInsufficient ? 0.6 : 1
                            }}
                            title={hasData ? `${zone}: ${zoneData.count} txns (${zoneData.velocity.toFixed(1)}/mo)` : `${zone}: No data`}
                            onMouseEnter={(e) => handleCellHover(e, project, zone, zoneData)}
                            onMouseLeave={handleCellLeave}
                          >
                            {hasData ? (
                              isInsufficient ? (
                                <span className="text-xs text-gray-400">n&lt;5</span>
                              ) : (
                                <span className={`text-xs font-mono font-medium ${textColor}`}>
                                  {zoneData.z_score > 0 ? '+' : ''}{zoneData.z_score.toFixed(2)}
                                </span>
                              )
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tooltip */}
      {hoveredCell && hoveredCell.zoneData && (
        <div
          className="fixed z-50 bg-[#213448] text-white rounded-lg shadow-xl p-4 pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            minWidth: 200
          }}
        >
          <div className="font-bold text-sm mb-1">{hoveredCell.project.project_name}</div>
          <div className="text-xs text-[#94B4C1] mb-3">{hoveredCell.zone} Floor</div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#94B4C1]">Avg Velocity:</span>
              <span className="font-mono">{hoveredCell.zoneData.velocity.toFixed(2)} units/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#94B4C1]">Sample Size:</span>
              <span className="font-mono">n={hoveredCell.zoneData.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#94B4C1]">Z-Score:</span>
              <span className="font-mono">
                {hoveredCell.zoneData.z_score > 0 ? '+' : ''}{hoveredCell.zoneData.z_score.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-[#547792]/30">
              <span className="text-[#94B4C1]">Liquidity:</span>
              <span className={`font-medium ${
                hoveredCell.zoneData.z_score >= 0.25 ? 'text-blue-300' :
                hoveredCell.zoneData.z_score <= -0.25 ? 'text-blue-100' : 'text-gray-300'
              }`}>
                {hoveredCell.zoneData.liquidity_label}
              </span>
            </div>
          </div>

          {/* Arrow */}
          <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full">
            <div className="border-8 border-transparent border-t-[#213448]" />
          </div>
        </div>
      )}

      {/* Exclusion Note */}
      <div className="px-6 py-2 bg-[#547792]/10 border-t border-[#94B4C1]/20">
        <div className="flex items-center gap-2 text-xs text-[#547792]">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Excluded: Boutique projects (&lt;100 units) and projects with &lt;30 resale transactions
            {meta.exclusions?.low_transactions > 0 || meta.exclusions?.boutique_projects > 0 ? (
              <span className="text-[#94B4C1] ml-1">
                ({meta.exclusions.boutique_projects || 0} boutique, {meta.exclusions.low_transactions || 0} low volume)
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-[#94B4C1]">
              Based on resale transactions in the last {windowMonths} months
            </span>
          </div>
          <div className="text-[#94B4C1]">
            Darker = Faster to sell • Lighter = Slower to sell
          </div>
        </div>
      </div>
    </div>
  );
}

export default FloorLiquidityHeatmap;
