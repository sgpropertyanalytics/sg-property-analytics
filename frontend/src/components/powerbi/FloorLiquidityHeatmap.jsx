import React, { useEffect, useState, useMemo } from 'react';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getFloorLiquidityHeatmap } from '../../api/client';
import {
  FLOOR_LEVELS,
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
export function FloorLiquidityHeatmap({ height = 500, bedroom, segment }) {
  const { buildApiParams, filters } = usePowerBIFilters();

  // Local state for window toggle
  const [windowMonths, setWindowMonths] = useState(12);

  // Data state
  const [data, setData] = useState({ projects: [], floor_zone_order: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tooltip state
  const [hoveredCell, setHoveredCell] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = buildApiParams({
          window_months: windowMonths,
          min_transactions: 10
        });
        if (bedroom) params.bedroom = bedroom;
        if (segment) params.segment = segment;

        const response = await getFloorLiquidityHeatmap(params);
        setData(response.data.data || { projects: [], floor_zone_order: [] });
      } catch (err) {
        console.error('Error fetching heatmap data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [buildApiParams, filters, windowMonths, bedroom, segment]);

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
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
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
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (data.projects.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
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
          </div>

          {/* Window Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#94B4C1] font-medium">Window:</span>
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

      {/* Legend */}
      <div className="px-6 py-2 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/20">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="text-[#94B4C1] font-medium">Liquidity:</span>
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
            <span className="text-[#94B4C1]">Very Illiquid</span>
          </div>
          <div className="flex items-center gap-1.5 ml-4 border-l border-[#94B4C1]/30 pl-4">
            <div className="w-4 h-3 rounded border border-dashed border-[#94B4C1]" style={{ backgroundColor: LIQUIDITY_COLORS.insufficient }} />
            <span className="text-[#94B4C1]">n&lt;5</span>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto" style={{ maxHeight: height - 180 }}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="sticky left-0 bg-[#EAE0CF]/50 text-left px-4 py-2 font-semibold text-[#213448] border-b border-r border-[#94B4C1]/30 min-w-[200px]">
                Project
              </th>
              {floorZones.map((zone) => (
                <th
                  key={zone}
                  className="bg-[#EAE0CF]/50 text-center px-3 py-2 font-medium text-[#547792] border-b border-[#94B4C1]/30 min-w-[80px]"
                >
                  {zone}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.projects.map((project, idx) => (
              <tr key={project.project_name} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'}>
                {/* Project Name (sticky) */}
                <td className={`sticky left-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#EAE0CF]/10'} px-4 py-2 font-medium text-[#213448] border-r border-[#94B4C1]/30 truncate`}>
                  <div className="max-w-[200px] truncate" title={project.project_name}>
                    {project.project_name}
                  </div>
                  <div className="text-xs text-[#94B4C1]">{project.district} • {project.total_transactions} transactions</div>
                </td>

                {/* Floor Zone Cells */}
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
                      className="text-center px-2 py-3 cursor-pointer transition-all duration-100 hover:ring-2 hover:ring-[#213448] hover:ring-inset"
                      style={{
                        backgroundColor: bgColor,
                        opacity: isInsufficient ? 0.6 : 1
                      }}
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
