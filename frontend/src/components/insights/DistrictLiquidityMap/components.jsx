/**
 * DistrictLiquidityMap Subcomponents
 *
 * All presentational components for the liquidity map visualization.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { REGIONS, CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS } from '../../../constants';
import {
  getScoreBadgeStyle,
  getScoreLabel,
  getRegionBadge,
  getTierBadgeStyle,
  getSpreadLabel,
} from './utils';
import { BEDROOM_OPTIONS, PERIOD_OPTIONS, SALE_TYPE_OPTIONS } from './constants';

// =============================================================================
// INFO TOOLTIP
// =============================================================================

export function InfoTooltip({ text, color = '#94B4C1' }) {
  return (
    <span className="relative group inline-flex items-center ml-1">
      <span
        className="w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px] font-bold cursor-help"
        style={{ borderColor: color, color: color }}
      >
        i
      </span>
      {/* Tooltip - positioned ABOVE icon to avoid clipping by overflow-x-auto containers */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-[#213448] bg-white border border-[#94B4C1]/40 rounded-lg shadow-lg whitespace-normal w-52 text-left opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[9999]">
        {text}
        {/* Arrow pointing down */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-white"></span>
        <span
          className="absolute top-full left-1/2 -translate-x-1/2 border-[7px] border-transparent border-t-[#94B4C1]/40"
          style={{ marginTop: '1px' }}
        ></span>
      </span>
    </span>
  );
}

// =============================================================================
// DISTRICT LABEL (Map Marker)
// =============================================================================

export function DistrictLabel({ district, data, zoom, onHover, onLeave, isHovered }) {
  const hasData = data?.has_data;
  const metrics = data?.liquidity_metrics || {};
  const turnoverRate = metrics.turnover_rate ?? metrics.monthly_velocity ?? 0;
  const tier = metrics.liquidity_tier;
  const isCompact = zoom < 11.2;

  // Color based on liquidity tier
  const getLabelStyle = () => {
    if (!hasData) return 'bg-[#EAE0CF] text-[#94B4C1] border-[#94B4C1]/30';
    switch (tier) {
      case 'Very High':
        return 'bg-[#213448] text-white border-[#213448]';
      case 'High':
        return 'bg-[#547792] text-white border-[#547792]';
      case 'Neutral':
        return 'bg-[#94B4C1] text-[#213448] border-[#94B4C1]';
      case 'Low':
      case 'Very Low':
        return 'bg-[#EAE0CF] text-[#547792] border-[#94B4C1]';
      default:
        return 'bg-white text-[#213448] border-[#94B4C1]';
    }
  };

  const getShortName = (name) => {
    if (!name) return '';
    const parts = name.split('/');
    const first = parts[0].trim();
    return first.length > 12 ? first.substring(0, 11) + '...' : first;
  };

  return (
    <motion.div
      className="flex flex-col items-center cursor-pointer"
      onMouseEnter={() => onHover(district, data)}
      onMouseLeave={onLeave}
      animate={{ scale: isHovered ? 1.05 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Velocity pill */}
      <div
        className={`
          px-2 py-0.5 rounded-md shadow-md border font-bold
          transition-shadow duration-200
          ${getLabelStyle()}
          ${isHovered ? 'shadow-lg ring-2 ring-white/50' : ''}
          ${isCompact ? 'text-[9px]' : 'text-[11px]'}
        `}
      >
        {hasData ? `${turnoverRate.toFixed(1)}` : '-'}
      </div>

      {/* District info label */}
      <div
        className={`
          mt-0.5 px-1.5 py-0.5 rounded bg-white/90 backdrop-blur-sm
          shadow-sm border border-[#94B4C1]/30
          transition-all duration-200
          ${isHovered ? 'bg-white shadow-md' : ''}
        `}
      >
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-semibold text-[#213448]">{district.district}</span>
          {!isCompact && (
            <span className="text-[7px] text-[#547792] leading-tight text-center max-w-[60px] truncate">
              {getShortName(district.name)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// HOVER CARD
// =============================================================================

export function HoverCard({ district, data }) {
  if (!district || !data) return null;

  const metrics = data.liquidity_metrics || {};
  const bedroom = data.bedroom_breakdown || {};

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      className="absolute z-50 pointer-events-none top-[200px] left-4"
    >
      <div className="bg-white rounded-lg shadow-xl border border-[#94B4C1]/50 p-3 w-[180px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-[#213448] text-sm">{district.district}</span>
          {/* Liquidity Score Badge */}
          <div className="flex items-center gap-1">
            <span
              className={`px-2 py-0.5 rounded text-sm font-bold ${getScoreBadgeStyle(metrics.liquidity_score)}`}
            >
              {metrics.liquidity_score?.toFixed(0) || '-'}
            </span>
          </div>
        </div>

        {/* District name */}
        <p className="text-xs text-[#547792] mb-2 leading-tight">{district.name}</p>

        {/* Score tier label */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[#547792]">Liquidity Score</span>
          <span className="text-[10px] font-semibold text-[#213448]">
            {getScoreLabel(metrics.liquidity_score)}
          </span>
        </div>

        <div className="h-px bg-[#94B4C1]/30 mb-2" />

        {/* Stats */}
        <div className="space-y-1.5">
          {/* Turnover Rate (normalized by housing stock) */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#547792]">Turnover Rate</span>
            <div className="flex items-center gap-1">
              <span className="font-bold text-[#213448] text-sm">
                {metrics.turnover_rate?.toFixed(1) ?? metrics.monthly_velocity?.toFixed(1) ?? 0}
              </span>
              <span className="text-[9px] text-[#547792]">per 100</span>
              {metrics.low_units_confidence && (
                <span className="text-amber-500 text-[10px]" title="Low data coverage">⚠</span>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-[#547792]">Observations</span>
            <span className="font-semibold text-[#213448] text-xs">
              {metrics.tx_count?.toLocaleString() || 0}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-[#547792]">Z-Score</span>
            <span
              className={`font-bold text-xs ${(metrics.z_score || 0) >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}
            >
              {metrics.z_score !== null ? metrics.z_score?.toFixed(2) : '-'}
            </span>
          </div>

          {/* Housing Stock Coverage */}
          {metrics.total_units > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#547792]">Housing Stock</span>
              <span className="font-semibold text-[#213448] text-xs">
                {metrics.total_units?.toLocaleString()} units
              </span>
            </div>
          )}
        </div>

        <div className="h-px bg-[#94B4C1]/30 my-2" />

        {/* Sale Type Mix */}
        <div className="space-y-1">
          <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold">
            Sale Type Mix
          </p>
          <div className="flex gap-2">
            <div className="flex-1 bg-[#EAE0CF]/30 rounded px-2 py-1 text-center">
              <div className="text-[10px] text-[#547792]">New</div>
              <div className="text-xs font-semibold text-[#213448]">
                {metrics.new_sale_pct?.toFixed(0) || 0}%
              </div>
            </div>
            <div className="flex-1 bg-[#EAE0CF]/30 rounded px-2 py-1 text-center">
              <div className="text-[10px] text-[#547792]">Resale</div>
              <div className="text-xs font-semibold text-[#213448]">
                {metrics.resale_pct?.toFixed(0) || 0}%
              </div>
            </div>
          </div>
        </div>

        {/* Concentration / Fragility (Resale Only) */}
        {metrics.fragility_label && (
          <>
            <div className="h-px bg-[#94B4C1]/30 my-2" />
            <div className="space-y-1">
              <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold">
                Concentration Risk <span className="text-rose-400 font-normal">(resale)</span>
              </p>
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    metrics.fragility_label === 'Robust'
                      ? 'bg-emerald-100 text-emerald-700'
                      : metrics.fragility_label === 'Moderate'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {metrics.fragility_label}
                </span>
                <span className="text-[10px] text-[#547792]">
                  {metrics.resale_project_count || metrics.project_count || 0} resale projects
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#547792]">Gini Index</span>
                <span className="font-semibold text-[#213448]">
                  {metrics.concentration_gini?.toFixed(2) || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#547792]">Top Project Share</span>
                <span className="font-semibold text-[#213448]">
                  {metrics.top_project_share?.toFixed(0) || 0}%
                </span>
              </div>
            </div>
          </>
        )}

        {/* Bedroom breakdown if available */}
        {Object.keys(bedroom).length > 0 && (
          <>
            <div className="h-px bg-[#94B4C1]/30 my-2" />
            <div className="space-y-1">
              <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold">
                By Bedroom
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(bedroom)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([br, count]) => (
                    <span
                      key={br}
                      className="text-[9px] px-1.5 py-0.5 bg-[#EAE0CF]/50 rounded text-[#213448]"
                    >
                      {br}BR: {count}
                    </span>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// REGION SUMMARY BAR
// =============================================================================

export function RegionSummaryBar({ districtData, meta }) {
  const regionStats = useMemo(() => {
    const regionDistricts = {
      CCR: CCR_DISTRICTS,
      RCR: RCR_DISTRICTS,
      OCR: OCR_DISTRICTS,
    };

    const monthsInPeriod = meta?.months_in_period || 12;

    return REGIONS.map((region) => {
      const districts = districtData.filter(
        (d) => regionDistricts[region].includes(d.district_id) && d.has_data
      );

      if (districts.length === 0) {
        return { region, avgTurnover: null, txCount: 0, avgZScore: null, totalUnits: 0, resalesPerMonth: null };
      }

      const totalTx = districts.reduce((sum, d) => sum + (d.liquidity_metrics?.tx_count || 0), 0);
      const totalResales = districts.reduce((sum, d) => sum + (d.liquidity_metrics?.resale_count || 0), 0);
      const totalUnits = districts.reduce((sum, d) => sum + (d.liquidity_metrics?.total_units || 0), 0);

      // Resales per month for the region
      const resalesPerMonth = totalResales / monthsInPeriod;

      // Average turnover rate for region (weighted by units would be better, but simple average for now)
      const turnoverRates = districts
        .filter((d) => d.liquidity_metrics?.turnover_rate !== null && d.liquidity_metrics?.turnover_rate !== undefined)
        .map((d) => d.liquidity_metrics.turnover_rate);
      const avgTurnover =
        turnoverRates.length > 0 ? turnoverRates.reduce((a, b) => a + b, 0) / turnoverRates.length : null;

      // Average Z-score for region
      const zScores = districts
        .filter((d) => d.liquidity_metrics?.z_score !== null)
        .map((d) => d.liquidity_metrics.z_score);
      const avgZScore =
        zScores.length > 0 ? zScores.reduce((a, b) => a + b, 0) / zScores.length : null;

      return {
        region,
        avgTurnover,
        txCount: totalTx,
        totalUnits,
        avgZScore,
        resalesPerMonth,
      };
    });
  }, [districtData, meta]);

  const regionLabels = {
    CCR: { name: 'Core Central', desc: 'Premium Districts' },
    RCR: { name: 'Rest of Central', desc: 'City Fringe' },
    OCR: { name: 'Outside Central', desc: 'Suburban' },
  };

  const regionStyles = {
    CCR: 'border-[#213448]/20 bg-[#213448]/5',
    RCR: 'border-[#547792]/20 bg-[#547792]/5',
    OCR: 'border-[#94B4C1]/20 bg-[#94B4C1]/5',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30">
      {regionStats.map((stat) => (
        <div key={stat.region} className={`rounded-lg border p-2 sm:p-3 ${regionStyles[stat.region]}`}>
          {/* Mobile: horizontal layout, Desktop: vertical */}
          <div className="flex sm:flex-col items-center sm:items-stretch gap-2 sm:gap-0">
            {/* Region name and Z-score */}
            <div className="flex items-center justify-between sm:mb-1 min-w-[100px] sm:min-w-0">
              <span className="font-semibold text-[#213448] text-sm">{stat.region} Turnover %</span>
              {stat.avgZScore !== null && (
                <span
                  className={`text-xs font-bold ml-2 sm:ml-0 ${stat.avgZScore >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}
                >
                  Z: {stat.avgZScore.toFixed(1)}
                </span>
              )}
            </div>
            {/* Description - hidden on mobile */}
            <p className="hidden sm:block text-[10px] text-[#547792] mb-2">
              {regionLabels[stat.region].desc}
            </p>
            {/* Stats */}
            <div className="flex flex-col gap-1 flex-1 sm:flex-none">
              <div className="flex items-baseline gap-2 sm:justify-between">
                <span className="text-base sm:text-lg font-bold text-[#213448]">
                  {stat.avgTurnover?.toFixed(1) ?? '-'}%
                </span>
                <span className="text-[10px] sm:text-xs text-[#547792]">
                  {stat.txCount.toLocaleString()} tx
                </span>
              </div>
              <div className="flex items-baseline gap-2 sm:justify-between">
                <span className="text-sm sm:text-base font-semibold text-[#213448]">
                  {stat.resalesPerMonth !== null ? `${Math.round(stat.resalesPerMonth)} resales/month` : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// LIQUIDITY RANKING TABLE
// =============================================================================

export function LiquidityRankingTable({ districtData, selectedBed, selectedSaleType, selectedPeriod }) {
  // Build filter description for display
  const activeFilters = useMemo(() => {
    const parts = [];
    const period = PERIOD_OPTIONS.find(o => o.value === selectedPeriod);
    if (period && selectedPeriod !== 'all') parts.push(period.fullLabel || period.label);
    const bed = BEDROOM_OPTIONS.find(o => o.value === selectedBed);
    if (bed && selectedBed !== 'all') parts.push(bed.fullLabel || bed.label);
    const saleType = SALE_TYPE_OPTIONS.find(o => o.value === selectedSaleType);
    if (saleType && selectedSaleType !== 'all') parts.push(saleType.fullLabel || saleType.label);
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [selectedBed, selectedSaleType, selectedPeriod]);

  // Sort config state
  const [sortConfig, setSortConfig] = useState({
    column: 'liquidity_score',
    order: 'desc',
  });

  // Handle sort
  const handleSort = (column) => {
    setSortConfig((prev) => ({
      column,
      order: prev.column === column && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  };

  // Sort indicator component
  const SortIcon = ({ column }) => {
    if (sortConfig.column !== column) {
      return (
        <svg
          className="w-3 h-3 text-slate-300 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
          />
        </svg>
      );
    }
    return sortConfig.order === 'asc' ? (
      <svg
        className="w-3 h-3 text-blue-600 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg
        className="w-3 h-3 text-blue-600 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Calculate max tx_count for proportional bar visualization
  const maxTxCount = useMemo(() => {
    return Math.max(...districtData.filter(d => d.has_data).map(d => d.liquidity_metrics?.tx_count || 0), 1);
  }, [districtData]);

  // Sort data based on current sort config
  const sortedData = useMemo(() => {
    const filtered = [...districtData].filter((d) => d.has_data);

    return filtered.sort((a, b) => {
      const col = sortConfig.column;
      let aVal, bVal;

      // Handle nested metrics fields
      if (
        [
          'liquidity_score',
          'monthly_velocity',
          'turnover_rate',
          'z_score',
          'tx_count',
          'project_count',
          'new_sale_pct',
          'resale_pct',
          'concentration_gini',
          'top_project_share',
        ].includes(col)
      ) {
        aVal = a.liquidity_metrics?.[col];
        bVal = b.liquidity_metrics?.[col];
      } else if (col === 'liquidity_tier' || col === 'fragility_label') {
        aVal = a.liquidity_metrics?.[col] || '';
        bVal = b.liquidity_metrics?.[col] || '';
      } else {
        aVal = a[col];
        bVal = b[col];
      }

      // Handle null/undefined
      if (aVal === null || aVal === undefined)
        aVal = sortConfig.order === 'asc' ? Infinity : -Infinity;
      if (bVal === null || bVal === undefined)
        bVal = sortConfig.order === 'asc' ? Infinity : -Infinity;

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      // Numeric comparison
      return sortConfig.order === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [districtData, sortConfig]);

  return (
    <div className="border-t border-[#94B4C1]/30">
      {/* Table Header */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 bg-[#EAE0CF]/20">
        <h3 className="text-base sm:text-lg font-bold text-[#213448]">District Liquidity Ranking</h3>
        <p className="text-[10px] sm:text-xs text-[#547792]">
          <span className="hidden sm:inline">
            Click column headers to sort - Default: composite liquidity score (highest first)
          </span>
          <span className="sm:hidden">Sorted by liquidity score</span>
        </p>
        {activeFilters && (
          <p className="text-[10px] sm:text-xs text-[#547792] mt-1">
            <span className="font-medium">Filtered by:</span> {activeFilters}
          </p>
        )}
      </div>

      {/* Mobile/Tablet Card View - shown below lg breakpoint (1024px) */}
      {/* Removed fixed max-height to avoid nested scroll containers on touch devices */}
      <div className="lg:hidden p-2 sm:p-3 space-y-2">
        {sortedData.map((district, index) => {
          const m = district.liquidity_metrics || {};
          return (
            <div
              key={district.district_id}
              className={`p-3 bg-white rounded-lg border border-[#94B4C1]/30 ${index < 3 ? 'ring-1 ring-[#EAE0CF]' : ''}`}
            >
              {/* Header: Rank + District + Region + Score */}
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-[#EAE0CF]/50 text-[#547792]">
                  {index + 1}
                </span>
                <span className="font-semibold text-[#213448]">{district.district_id}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${getRegionBadge(district.region)}`}
                >
                  {district.region}
                </span>
                {/* Liquidity Score Badge */}
                <div className="ml-auto flex items-center gap-1">
                  <span
                    className={`px-2 py-0.5 rounded text-sm font-bold ${getScoreBadgeStyle(m.liquidity_score)}`}
                  >
                    {m.liquidity_score?.toFixed(0) || '-'}
                  </span>
                  <span className="text-[8px] text-[#547792]">{getScoreLabel(m.liquidity_score)}</span>
                </div>
              </div>

              {/* Area name */}
              <div className="text-xs text-[#213448] mb-2 truncate">{district.full_name}</div>

              {/* Key Metrics Grid - 4 columns with Score first */}
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="bg-sky-50/50 rounded p-1.5">
                  <div className="text-[10px] text-[#547792]">Turnover</div>
                  <div className="text-sm text-[#213448]">
                    {m.turnover_rate?.toFixed(1) ?? m.monthly_velocity?.toFixed(1) ?? '0'}
                  </div>
                </div>
                <div className="bg-[#EAE0CF]/30 rounded p-1.5">
                  <div className="text-[10px] text-[#547792] mb-1">Tx</div>
                  <div className="flex items-center gap-1">
                    <div className="flex-1 h-2 bg-[#EAE0CF]/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#547792] rounded-full"
                        style={{ width: `${((m.tx_count || 0) / maxTxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#213448] min-w-[32px] text-right">
                      {m.tx_count?.toLocaleString() || '0'}
                    </span>
                  </div>
                </div>
                <div className="bg-emerald-50/50 rounded p-1.5">
                  <div className="text-[10px] text-[#547792]">Tier</div>
                  <div className="text-[10px] text-[#213448]">
                    {m.liquidity_tier || '-'}
                  </div>
                </div>
                <div className="bg-[#EAE0CF]/30 rounded p-1.5">
                  <div className="text-[10px] text-[#547792]">Spread</div>
                  <div className="text-[10px] text-[#213448]">
                    {getSpreadLabel(m.fragility_label)}
                  </div>
                </div>
              </div>

              {/* Secondary row: Z-score */}
              <div className="flex justify-start mt-2 text-[10px] text-[#213448]">
                <span>
                  Z:{' '}
                  <span
                    className={
                      m.z_score >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }
                  >
                    {m.z_score?.toFixed(2) || '-'}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table View - no overflow-x-auto to prevent horizontal scroll (HF-5) */}
      <div className="hidden lg:block max-w-full">
        <table className="w-full text-xs">
          <thead>
            {/* Group Header Row - Exit Safety + Concentration (only shown on xl+ when all columns visible) */}
            <tr className="hidden xl:table-row bg-[#EAE0CF]/20">
              <th colSpan={6} className="border-b border-[#94B4C1]/20"></th>
              <th
                colSpan={3}
                className="px-3 py-1.5 text-center text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-100/70"
                title="Exit Safety metrics: Velocity, Z-Score, Tier calculated on RESALE only (organic demand signal)"
              >
                Exit Safety
                <span className="ml-1 text-[8px] font-normal text-emerald-500">(resale)</span>
              </th>
              <th
                colSpan={3}
                className="px-3 py-1.5 text-center text-[10px] font-bold text-rose-700 uppercase tracking-wider bg-rose-100/70"
                title="Concentration metrics: Gini, Fragility, Top Share calculated on RESALE only (avoids developer release distortion)"
              >
                Concentration Risks
                <span className="ml-1 text-[8px] font-normal text-rose-400">(resale)</span>
              </th>
            </tr>
            {/* Column Header Row */}
            <tr className="bg-[#EAE0CF]/30 border-b border-[#94B4C1]/30">
              <th className="px-3 py-2 text-left font-semibold text-[#213448] whitespace-nowrap">
                Rank
              </th>
              <th
                className="px-3 py-3 min-h-[44px] text-center font-semibold text-[#213448] whitespace-nowrap cursor-pointer hover:bg-slate-100 active:bg-slate-200 select-none"
                onClick={() => handleSort('liquidity_score')}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  Score
                  <SortIcon column="liquidity_score" />
                  <InfoTooltip
                    text="Composite liquidity score (0-100). Exit Safety (60%): velocity, breadth, concentration. Market Health (40%): volume, diversity, stability, organic demand."
                    color="#0ea5e9"
                  />
                </span>
              </th>
              <th
                className="px-3 py-3 min-h-[44px] text-left font-semibold text-[#213448] whitespace-nowrap cursor-pointer hover:bg-slate-100 active:bg-slate-200 select-none"
                onClick={() => handleSort('district_id')}
              >
                <span className="inline-flex items-center gap-1">
                  District
                  <SortIcon column="district_id" />
                </span>
              </th>
              <th
                className="px-3 py-3 min-h-[44px] text-center font-semibold text-[#213448] whitespace-nowrap cursor-pointer hover:bg-slate-100 active:bg-slate-200 select-none"
                onClick={() => handleSort('region')}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  Region
                  <SortIcon column="region" />
                </span>
              </th>
              <th
                className="hidden xl:table-cell px-3 py-3 min-h-[44px] text-right font-semibold text-[#213448] whitespace-nowrap cursor-pointer hover:bg-slate-100 active:bg-slate-200 select-none"
                onClick={() => handleSort('project_count')}
              >
                <span className="inline-flex items-center justify-end gap-1">
                  Projects
                  <SortIcon column="project_count" />
                  <InfoTooltip text="Number of distinct condo projects with transactions in this period. Higher = more market breadth." />
                </span>
              </th>
              <th
                className="px-3 py-3 min-h-[44px] text-right font-semibold text-[#213448] whitespace-nowrap cursor-pointer hover:bg-slate-100 active:bg-slate-200 select-none"
                onClick={() => handleSort('tx_count')}
              >
                <span className="inline-flex items-center justify-end gap-1">
                  Observations
                  <SortIcon column="tx_count" />
                  <InfoTooltip text="Total number of observations across all projects in this district." />
                </span>
              </th>
              <th
                className="px-3 py-3 min-h-[44px] text-center font-semibold text-[#213448] whitespace-nowrap bg-emerald-50/50 cursor-pointer hover:bg-emerald-100/50 active:bg-emerald-200/50 select-none"
                onClick={() => handleSort('liquidity_tier')}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  Tier
                  <SortIcon column="liquidity_tier" />
                </span>
              </th>
              <th
                className="px-3 py-3 min-h-[44px] text-right font-semibold text-[#213448] whitespace-nowrap bg-emerald-50/50 cursor-pointer hover:bg-emerald-100/50 active:bg-emerald-200/50 select-none"
                onClick={() => handleSort('turnover_rate')}
              >
                <span className="inline-flex items-center justify-end gap-1">
                  Turnover
                  <SortIcon column="turnover_rate" />
                  <InfoTooltip
                    text="Resales per 100 units - normalized for district size. Higher = easier to exit. Based on resale only."
                    color="#34d399"
                  />
                </span>
              </th>
              <th
                className="px-3 py-3 min-h-[44px] text-right font-semibold text-[#213448] whitespace-nowrap bg-emerald-50/50 cursor-pointer hover:bg-emerald-100/50 active:bg-emerald-200/50 select-none"
                onClick={() => handleSort('z_score')}
              >
                <span className="inline-flex items-center justify-end gap-1">
                  Z-Score
                  <SortIcon column="z_score" />
                  <InfoTooltip
                    text="Standard deviations from mean resale velocity. Positive = above average liquidity, Negative = below average."
                    color="#34d399"
                  />
                </span>
              </th>
              <th
                className="px-3 py-3 min-h-[44px] text-center font-semibold text-[#213448] whitespace-nowrap bg-rose-50/50 cursor-pointer hover:bg-rose-100/50 active:bg-rose-200/50 select-none"
                onClick={() => handleSort('fragility_label')}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  Spread
                  <SortIcon column="fragility_label" />
                  <InfoTooltip
                    text="Transaction spread across projects. Wide = distributed across many projects. Narrow = concentrated in few projects."
                    color="#fb7185"
                  />
                </span>
              </th>
              <th
                className="hidden xl:table-cell px-3 py-3 min-h-[44px] text-right font-semibold text-[#213448] whitespace-nowrap bg-rose-50/50 cursor-pointer hover:bg-rose-100/50 active:bg-rose-200/50 select-none"
                onClick={() => handleSort('concentration_gini')}
              >
                <span className="inline-flex items-center justify-end gap-1">
                  Gini
                  <SortIcon column="concentration_gini" />
                  <InfoTooltip
                    text="Gini coefficient (0-1). Lower = transactions evenly spread. Higher = concentrated in few projects. Based on resale only."
                    color="#fb7185"
                  />
                </span>
              </th>
              <th
                className="hidden xl:table-cell px-3 py-3 min-h-[44px] text-right font-semibold text-[#213448] whitespace-nowrap bg-rose-50/50 cursor-pointer hover:bg-rose-100/50 active:bg-rose-200/50 select-none"
                onClick={() => handleSort('top_project_share')}
              >
                <span className="inline-flex items-center justify-end gap-1">
                  Top Share
                  <SortIcon column="top_project_share" />
                  <InfoTooltip
                    text="Percentage of resale transactions from the single most active project. High % = reliance on one project."
                    color="#fb7185"
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((district, index) => {
              const m = district.liquidity_metrics || {};
              return (
                <tr
                  key={district.district_id}
                  className={`border-b border-[#94B4C1]/20 hover:bg-[#EAE0CF]/20 transition-colors ${index < 3 ? 'bg-[#EAE0CF]/10' : ''}`}
                >
                  {/* Rank */}
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-[#EAE0CF]/50 text-[#547792]">
                      {index + 1}
                    </span>
                  </td>

                  {/* Liquidity Score */}
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className={`inline-flex items-center justify-center w-10 h-6 rounded-md text-sm font-bold ${getScoreBadgeStyle(m.liquidity_score)}`}
                      >
                        {m.liquidity_score !== null && m.liquidity_score !== undefined
                          ? m.liquidity_score.toFixed(0)
                          : '-'}
                      </span>
                      <span className="text-[8px] text-[#547792]">
                        {getScoreLabel(m.liquidity_score)}
                      </span>
                    </div>
                  </td>

                  {/* District (ID + Area Name combined) - truncated to prevent overflow */}
                  <td
                    className="px-3 py-2 text-[#213448] max-w-[200px]"
                    title={`${district.district_id} - ${district.full_name}`}
                  >
                    <div className="flex items-baseline gap-1 min-w-0">
                      <span className="font-semibold flex-shrink-0">{district.district_id}</span>
                      <span className="truncate text-[#547792]">- {district.full_name}</span>
                    </div>
                  </td>

                  {/* Region Badge */}
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${getRegionBadge(district.region)}`}
                    >
                      {district.region}
                    </span>
                  </td>

                  {/* Project Count (Market Structure - Combined) - hidden on lg, shown on xl+ */}
                  <td className="hidden xl:table-cell px-3 py-2 text-right text-[#213448] font-mono tabular-nums">{m.project_count || 0}</td>

                  {/* Transaction Count (Market Structure - Combined) with inline bar */}
                  <td className="px-3 py-2 text-[#213448]">
                    <div className="flex items-center gap-2">
                      {/* Proportional volume bar */}
                      <div className="flex-1 h-3.5 bg-[#EAE0CF]/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#547792] rounded-full"
                          style={{ width: `${((m.tx_count || 0) / maxTxCount) * 100}%` }}
                        />
                      </div>
                      {/* Number value */}
                      <span className="text-right min-w-[45px] font-mono tabular-nums">
                        {m.tx_count?.toLocaleString() || '0'}
                      </span>
                    </div>
                  </td>

                  {/* Exit Safety Group - Liquidity Tier (Resale-only) */}
                  <td className="px-3 py-2 text-center bg-emerald-50/40">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${getTierBadgeStyle(m.liquidity_tier)}`}
                    >
                      {m.liquidity_tier || '-'}
                    </span>
                  </td>

                  {/* Exit Safety Group - Turnover Rate (Normalized, Resale-only) */}
                  <td className="px-3 py-2 text-right text-[#213448] bg-emerald-50/40 font-mono tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {m.turnover_rate?.toFixed(1) ?? m.monthly_velocity?.toFixed(1) ?? '0'}
                      {m.low_units_confidence && (
                        <span className="text-amber-500 text-[10px]" title="Low data coverage">⚠</span>
                      )}
                    </span>
                  </td>

                  {/* Exit Safety Group - Z-Score (Resale-only) */}
                  <td className="px-3 py-2 text-right text-[#213448] bg-emerald-50/40 font-mono tabular-nums">
                    <span
                      className={
                        (m.z_score || 0) >= 0.5
                          ? 'text-emerald-600'
                          : (m.z_score || 0) <= -0.5
                            ? 'text-rose-600'
                            : ''
                      }
                    >
                      {m.z_score?.toFixed(2) || '-'}
                    </span>
                  </td>

                  {/* Concentration Risks Group - Spread (Resale-only) */}
                  <td className="px-3 py-2 text-center text-[#213448] bg-rose-50/40">
                    {getSpreadLabel(m.fragility_label)}
                  </td>

                  {/* Concentration Risks Group - Gini Index (Resale-only) - hidden on lg, shown on xl+ */}
                  <td className="hidden xl:table-cell px-3 py-2 text-right text-[#213448] bg-rose-50/40 font-mono tabular-nums">
                    {m.concentration_gini?.toFixed(2) || '-'}
                  </td>

                  {/* Concentration Risks Group - Top Project Share (Resale-only) - hidden on lg, shown on xl+ */}
                  <td className="hidden xl:table-cell px-3 py-2 text-right text-[#213448] bg-rose-50/40 font-mono tabular-nums">
                    {m.top_project_share?.toFixed(0) || '0'}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="px-3 sm:px-4 py-2 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30 text-[10px] sm:text-xs text-[#547792]">
        {sortedData.length} districts with data
      </div>
    </div>
  );
}
