/**
 * MarketStrategyMap - Clean Light-Theme District Price Map
 *
 * Features:
 * - Light CartoDB Positron basemap
 * - Clean labeled pin markers showing PSF
 * - Hover cards with PSF, transaction count, YoY change
 * - Bottom summary bar for CCR/RCR/OCR regions
 * - Responsive design matching dashboard aesthetic
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import { BarChart3, DollarSign } from 'lucide-react';
import { HelpTooltip } from '../ui/HelpTooltip';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../api/client';
// GeoJSON is lazy-loaded to reduce initial bundle size (~100KB savings)
// Only SINGAPORE_CENTER is needed at import time for map config
import { SINGAPORE_CENTER } from '../../data/singaporeDistrictsGeoJSON';
import { DISTRICT_CENTROIDS } from '../../data/districtCentroids';
import { REGIONS, CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS, getRegionBadgeClass, PERIOD_FILTER_OPTIONS } from '../../constants';
import { useSubscription } from '../../context/SubscriptionContext';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery, QueryStatus } from '../../hooks';
// Phase 3.4: Using standardized Zustand filters (same as Market Overview)
import { useZustandFilters } from '../../stores';
import { SaleType } from '../../schemas/apiContract';
import { getPercentile } from '../../utils/statistics';
import { assertKnownVersion } from '../../adapters';
// Reuse LeaderLine from liquidity map for tethered hover effect
import { LeaderLine } from './DistrictLiquidityMap/components';

// =============================================================================
// CONFIGURATION
// =============================================================================

const MAP_CONFIG = {
  center: { longitude: SINGAPORE_CENTER.lng, latitude: SINGAPORE_CENTER.lat },
  defaultZoom: 10.8,
  maxBounds: [[103.55, 1.22], [104.15, 1.50]],  // Limit south to avoid showing too much sea
  minZoom: 10,
  maxZoom: 15,
};

// Light basemap (no labels - cleaner with only our district markers)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';

// Region fill colors (aligned with liquidity map color theme)
const REGION_FILLS = {
  CCR: 'rgba(33, 52, 72, 0.60)',   // Deep Navy - Premium/Core Central
  RCR: 'rgba(84, 119, 146, 0.50)', // Ocean Blue - City Fringe
  OCR: 'rgba(148, 180, 193, 0.35)', // Sky Blue - Suburban
};

// Volume glow colors (warm palette - only top 30% get glow)
const VOLUME_GLOW = {
  hot: 'drop-shadow(0 0 12px rgba(239, 68, 68, 0.75))',    // Red - Top 10%
  warm: 'drop-shadow(0 0 10px rgba(249, 115, 22, 0.65))',  // Orange - 10-20%
  mild: 'drop-shadow(0 0 8px rgba(250, 204, 21, 0.55))',   // Yellow - 20-30%
};

// Filter options removed - now using standardized FilterBar at page level

// Manual marker offsets for crowded central districts
const MARKER_OFFSETS = {
  'D09': { lng: -0.008, lat: 0.006 },
  'D10': { lng: 0.008, lat: 0.003 },
  'D11': { lng: 0.005, lat: -0.006 },
  'D01': { lng: -0.003, lat: 0.004 },
  'D02': { lng: 0.004, lat: -0.003 },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function polylabel(polygon) {
  const ring = polygon[0];
  if (!ring || ring.length < 4) return null;

  let sumX = 0, sumY = 0, sumArea = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    const cross = x1 * y2 - x2 * y1;
    sumX += (x1 + x2) * cross;
    sumY += (y1 + y2) * cross;
    sumArea += cross;
  }

  if (sumArea === 0) {
    const xs = ring.map(p => p[0]);
    const ys = ring.map(p => p[1]);
    return {
      lng: (Math.min(...xs) + Math.max(...xs)) / 2,
      lat: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }

  sumArea *= 3;
  return { lng: sumX / sumArea, lat: sumY / sumArea };
}

function formatPsf(value) {
  if (!value) return '-';
  return `$${Math.round(value).toLocaleString()}`;
}

function getRegionForDistrict(districtId) {
  if (CCR_DISTRICTS.includes(districtId)) return 'CCR';
  if (RCR_DISTRICTS.includes(districtId)) return 'RCR';
  return 'OCR';
}

// Calculate volume percentile thresholds from current data (for top 30%)
function calculateVolumeThresholds(districtData) {
  const volumes = districtData
    .filter(d => d.has_data && d.tx_count > 0)
    .map(d => d.tx_count)
    .sort((a, b) => a - b);

  if (volumes.length === 0) {
    return { p70: 0, p80: 0, p90: 0 };
  }

  return {
    p70: getPercentile(volumes, 70),  // Bottom 70% cutoff
    p80: getPercentile(volumes, 80),  // Top 20% cutoff
    p90: getPercentile(volumes, 90),  // Top 10% cutoff
  };
}

// Get volume tier for a district (only top 30% get glow)
function getVolumeTier(txCount, thresholds) {
  if (!txCount || txCount < thresholds.p70) return null;  // Bottom 70% = no glow
  if (txCount >= thresholds.p90) return 'hot';            // Top 10%
  if (txCount >= thresholds.p80) return 'warm';           // 10-20%
  return 'mild';                                          // 20-30%
}

// =============================================================================
// DISTRICT LABEL COMPONENT
// =============================================================================

function DistrictLabel({ district, data, zoom, onHover, onLeave, isHovered, volumeTier }) {
  const hasData = data?.has_data;
  const psf = data?.median_psf || 0;
  const isCompact = zoom < 11.2;

  // Color based on PSF tier - using slate palette
  const getPriceStyle = () => {
    if (!hasData) return 'bg-slate-100 text-slate-400 border-slate-300';
    if (psf >= 2200) return 'bg-slate-800 text-white border-slate-800';
    if (psf >= 1400) return 'bg-slate-600 text-white border-slate-600';
    return 'bg-white text-slate-800 border-slate-300';
  };

  // Truncate area name for display
  const getShortName = (name) => {
    if (!name) return '';
    // Take first part before "/" or limit length
    const parts = name.split('/');
    const first = parts[0].trim();
    return first.length > 12 ? first.substring(0, 11) + '…' : first;
  };

  // Get volume glow style (only top 30% districts get glow)
  const glowStyle = volumeTier ? VOLUME_GLOW[volumeTier] : 'none';

  return (
    <motion.div
      className="flex flex-col items-center cursor-pointer"
      onMouseEnter={() => onHover(district, data)}
      onMouseLeave={onLeave}
      animate={{ scale: isHovered ? 1.05 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Price pill - always shows median PSF */}
      <div
        className={`
          px-2 py-0.5 rounded-md shadow-md border font-bold
          transition-shadow duration-200
          ${getPriceStyle()}
          ${isHovered ? 'shadow-lg ring-2 ring-white/50' : ''}
          ${isCompact ? 'text-[9px]' : 'text-[11px]'}
        `}
      >
        {hasData ? formatPsf(psf) : '-'}
      </div>

      {/* District info label - shows district number and area name */}
      {/* Volume glow applied here for top 30% districts */}
      <div
        className={`
          mt-0.5 px-1.5 py-0.5 rounded bg-white/90 backdrop-blur-sm
          shadow-sm border border-slate-200
          transition-all duration-200
          ${isHovered ? 'bg-white shadow-md' : ''}
        `}
        style={{ filter: glowStyle }}
      >
        <div className="flex flex-col items-center">
          {/* District number */}
          <span className="text-[9px] font-semibold text-slate-800">
            {district.district}
          </span>
          {/* Area name - shown when zoomed in */}
          {!isCompact && (
            <span className="text-[7px] text-slate-500 leading-tight text-center max-w-[60px] truncate">
              {getShortName(district.name)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// HOVER CARD COMPONENT - Fixed position below legend (top-left)
// =============================================================================

function HoverCard({ district, data }) {
  if (!district || !data) return null;

  const yoyValue = data.yoy_pct;
  const hasYoY = yoyValue !== null && yoyValue !== undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      className="absolute z-50 pointer-events-none top-[180px] sm:top-[280px] left-2 sm:left-4"
    >
      <div className="bg-white rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] border border-mono-muted p-2 sm:p-3 w-[140px] sm:w-[165px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-slate-800 text-sm">
            {district.district}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${getRegionBadgeClass(district.region)}`}>
            {district.region}
          </span>
        </div>

        {/* District name */}
        <p className="text-xs text-slate-500 mb-2 leading-tight">
          {district.name}
        </p>

        <div className="h-px bg-slate-200 mb-2" />

        {/* Stats */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">Median PSF</span>
            <span className="font-bold text-slate-800 text-sm">
              {formatPsf(data.median_psf)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">Observations</span>
            <span className="font-semibold text-slate-800 text-xs">
              {data.tx_count?.toLocaleString() || 0}
            </span>
          </div>

          {hasYoY && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">YoY Change</span>
              <span
                className={`font-bold text-xs ${
                  yoyValue >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {yoyValue >= 0 ? '↑' : '↓'}{Math.abs(yoyValue).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// REGION SUMMARY BAR COMPONENT
// =============================================================================

/**
 * Build tooltip content string for region methodology
 */
function buildMethodologyTooltip(stat) {
  if (!stat.districtBreakdown || stat.districtBreakdown.length === 0) {
    return `${stat.region} - No data available`;
  }

  const lines = [
    `${stat.region} Calculation`,
    '',
    'Formula: Σ(District Median × Tx) / Σ(Tx)',
    '',
    'District Breakdown:',
  ];

  // Add each district's contribution
  stat.districtBreakdown.forEach(d => {
    const psf = d.medianPsf ? `$${Math.round(d.medianPsf).toLocaleString()}` : '-';
    lines.push(`  ${d.district}: ${psf} × ${d.txCount.toLocaleString()} tx`);
  });

  // Add totals
  lines.push('');
  lines.push(`Result: ${stat.medianPsf ? `$${Math.round(stat.medianPsf).toLocaleString()}` : '-'} psf`);
  lines.push(`Total: ${stat.txCount.toLocaleString()} transactions`);

  return lines.join('\n');
}

function RegionSummaryBar({ districtData, selectedPeriod }) {
  // Calculate aggregates for each region
  const regionStats = useMemo(() => {
    const regionDistricts = {
      CCR: CCR_DISTRICTS,
      RCR: RCR_DISTRICTS,
      OCR: OCR_DISTRICTS,
    };

    return REGIONS.map(region => {
      const districts = districtData.filter(
        d => regionDistricts[region].includes(d.district_id) && d.has_data
      );

      if (districts.length === 0) {
        return { region, medianPsf: null, txCount: 0, yoyPct: null, districtBreakdown: [] };
      }

      // Weighted average PSF by transaction count
      const totalTx = districts.reduce((sum, d) => sum + (d.tx_count || 0), 0);
      const weightedPsf = districts.reduce(
        (sum, d) => sum + (d.median_psf || 0) * (d.tx_count || 0),
        0
      ) / (totalTx || 1);

      // Weighted average YoY (consistent with PSF weighting)
      const districtsWithYoY = districts.filter(d => d.yoy_pct !== null && d.tx_count > 0);
      const totalTxWithYoY = districtsWithYoY.reduce((sum, d) => sum + (d.tx_count || 0), 0);
      const avgYoY = totalTxWithYoY > 0
        ? districtsWithYoY.reduce((sum, d) => sum + d.yoy_pct * (d.tx_count || 0), 0) / totalTxWithYoY
        : null;

      // District breakdown for tooltip (sorted by tx count descending)
      const districtBreakdown = districts
        .map(d => ({
          district: d.district_id,
          medianPsf: d.median_psf,
          txCount: d.tx_count || 0,
        }))
        .sort((a, b) => b.txCount - a.txCount);

      return {
        region,
        medianPsf: weightedPsf,
        txCount: totalTx,
        yoyPct: avgYoY,
        districtBreakdown,
      };
    });
  }, [districtData]);

  const regionStyles = {
    CCR: 'border-slate-400 bg-slate-100',
    RCR: 'border-slate-300 bg-slate-50',
    OCR: 'border-slate-200 bg-white',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 bg-slate-50 border-t border-slate-200">
      {regionStats.map(stat => (
        <div
          key={stat.region}
          className={`rounded-sm border p-2 sm:p-3 ${regionStyles[stat.region]}`}
        >
          {/* Mobile: horizontal layout, Desktop: vertical */}
          <div className="flex sm:flex-col items-center sm:items-stretch gap-2 sm:gap-0">
            {/* Region name, Help tooltip, and YoY */}
            <div className="flex items-center justify-between sm:mb-1 min-w-[60px] sm:min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-slate-800 text-xs sm:text-sm">
                  <span className="sm:hidden">{stat.region}</span>
                  <span className="hidden sm:inline">{stat.region} Median PSF</span>
                </span>
                <HelpTooltip content={buildMethodologyTooltip(stat)} />
              </div>
              {stat.yoyPct !== null && (
                <span
                  className={`text-xs font-bold ml-2 sm:ml-0 ${
                    stat.yoyPct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {stat.yoyPct >= 0 ? '↑' : '↓'}{Math.abs(stat.yoyPct).toFixed(1)}%
                </span>
              )}
            </div>
            {/* Description - hidden on mobile */}
            <p className="hidden sm:block text-[10px] text-slate-500 mb-2">
              Volume-weighted by District Txs
            </p>
            {/* Stats */}
            <div className="flex items-baseline gap-2 sm:justify-between flex-1 sm:flex-none">
              <span className="text-base sm:text-lg font-bold text-slate-800">
                {stat.medianPsf ? formatPsf(stat.medianPsf) : '-'}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500">
                {stat.txCount.toLocaleString()} tx
                <span className="text-slate-500/60 ml-1">
                  ({selectedPeriod === 'all' ? 'all time' : PERIOD_FILTER_OPTIONS.find(p => p.value === selectedPeriod)?.label || '1Y'} avg)
                </span>
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * MarketStrategyMap Component
 *
 * Phase 3.4: Uses standardized Zustand filters (same pattern as Market Overview charts)
 * Filters are managed by page-level FilterBar, not embedded in this component.
 *
 * @param {{
 *  selectedSaleType?: string,
 *  mapMode?: string,
 *  onModeChange?: (value: string) => void,
 *  enabled?: boolean,
 * }} props
 */
function MarketStrategyMapBase({
  selectedSaleType = SaleType.RESALE,
  mapMode,
  onModeChange,
  enabled = true,
}) {
  const { isPremium, isFreeResolved } = useSubscription();
  const [hoveredDistrict, setHoveredDistrict] = useState(null);

  // Refs for map container and map instance (for tethered hover position calculations)
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // Phase 4: Simplified filter access - read values directly from Zustand
  // No buildApiParams abstraction, no debouncedFilterKey (TanStack handles cache keys)
  const { filters } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset'
    ? filters.timeFilter.value
    : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';

  // For display in RegionSummaryBar
  const selectedPeriod = timeframe;

  // Lazy-load GeoJSON to reduce initial bundle size (~100KB savings)
  const [geoJSON, setGeoJSON] = useState(null);
  useEffect(() => {
    import('../../data/singaporeDistrictsGeoJSON').then((module) => {
      setGeoJSON(module.singaporeDistrictsGeoJSON);
    });
  }, []);

  // Phase 4: Simplified data fetching - no adapter layer, inline params
  // Backend now accepts frontend param names directly (timeframe, bedroom)
  const { data, status, error, refetch } = useAppQuery(
    async (signal) => {
      const response = await apiClient.get('/insights/district-psf', {
        params: {
          timeframe,  // Backend accepts 'timeframe' directly
          bedroom,    // Backend accepts 'bedroom' directly (alias for 'bed')
          sale_type: selectedSaleType,
        },
        signal,
      });
      // Contract validation - detect shape changes early
      assertKnownVersion(response.data, '/api/insights/district-psf');
      return response.data.districts || [];
    },
    // Simple query key - TanStack Query handles cache deduplication automatically
    ['district-psf', timeframe, bedroom, selectedSaleType],
    { chartName: 'MarketStrategyMap', enabled, initialData: null }
  );

  // Guard against null during in-flight state (same pattern as DistrictLiquidityMap)
  const districtData = data || [];

  // Derive loading from status
  const loading =
    status === QueryStatus.PENDING ||
    status === QueryStatus.LOADING ||
    status === QueryStatus.REFRESHING;

  const [viewState, setViewState] = useState({
    longitude: MAP_CONFIG.center.longitude,
    latitude: MAP_CONFIG.center.latitude,
    zoom: MAP_CONFIG.defaultZoom,
    pitch: 0,
    bearing: 0,
  });

  // Create district data lookup
  const districtMap = useMemo(() => {
    const map = {};
    districtData.forEach(d => {
      map[d.district_id] = d;
    });
    return map;
  }, [districtData]);

  // Calculate volume thresholds for glow effect (recalculates when data/period changes)
  const volumeThresholds = useMemo(() => {
    return calculateVolumeThresholds(districtData);
  }, [districtData]);

  // Use precomputed district centroids (calculated at module load time)
  const districtCentroids = DISTRICT_CENTROIDS;

  // Calculate screen position of hovered district for tethered callout (same as liquidity map)
  const lineCoords = useMemo(() => {
    if (!hoveredDistrict?.district || !mapContainerRef.current) {
      return null;
    }

    const centroid = hoveredDistrict.district.centroid;
    if (!centroid) return null;

    // Get map container bounds
    const containerRect = mapContainerRef.current.getBoundingClientRect();
    const mapWidth = containerRect.width;
    const mapHeight = containerRect.height;

    // Use map's project method for accurate screen coordinates
    let districtX, districtY;
    if (mapRef.current) {
      const projected = mapRef.current.project([centroid.lng, centroid.lat]);
      districtX = projected.x;
      districtY = projected.y;
    } else {
      // Fallback calculation
      const scale = Math.pow(2, viewState.zoom) * 256 / 360;
      districtX = mapWidth / 2 + (centroid.lng - viewState.longitude) * scale * Math.cos(viewState.latitude * Math.PI / 180);
      districtY = mapHeight / 2 - (centroid.lat - viewState.latitude) * scale;
    }

    // Fixed card position: matches HoverCard CSS (top-[180px] sm:top-[280px] left-2 sm:left-4)
    const cardWidth = 165; // Matches sm:w-[165px]
    const cardLeft = 16; // Matches sm:left-4
    const cardTop = 280; // Matches sm:top-[280px]
    const headerHeight = 40; // Approximate header height

    // Leader line: start = card header, end = district
    const cardRightEdge = cardLeft + cardWidth;
    const cardHeaderMiddle = cardTop + headerHeight / 2;

    return {
      startX: cardRightEdge,
      startY: cardHeaderMiddle,
      endX: districtX,
      endY: districtY,
    };
  }, [hoveredDistrict, viewState]);

  // Region fill color expression
  const fillColorExpression = useMemo(() => {
    const expr = ['case'];
    [...CCR_DISTRICTS, ...RCR_DISTRICTS, ...OCR_DISTRICTS].forEach(d => {
      expr.push(['==', ['get', 'district'], d]);
      expr.push(REGION_FILLS[getRegionForDistrict(d)]);
    });
    expr.push('rgba(200, 200, 200, 0.05)');
    return expr;
  }, []);

  // Handle hover
  const handleLeave = useCallback(() => {
    setHoveredDistrict(null);
  }, []);

  return (
    <div className="bg-white rounded-sm border border-slate-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Header with filters */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              Price/PSF Analysis by District
            </h2>
            <p className="text-[10px] text-slate-500 font-mono">
              <span className="hidden sm:inline">Median PSF by postal district</span>
              <span className="sm:hidden">Median PSF by district</span>
            </p>
          </div>

          {/* Toggle + Filter pills */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Volume/Price Mode Toggle - kept for view switching */}
            {/* Filters (Bedroom, Time, Region) are now in the page-level FilterBar */}
            {onModeChange && (
              <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-100 rounded-sm p-0.5 sm:p-1">
                <button
                  onClick={() => onModeChange('volume')}
                  className={`relative flex items-center justify-center gap-1 min-h-[44px] px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-medium rounded-md transition-all z-10 touch-manipulation ${
                    mapMode === 'volume' ? 'text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {mapMode === 'volume' && (
                    <motion.div
                      layoutId="price-map-toggle"
                      className="absolute inset-0 bg-slate-800 rounded-md -z-10 shadow-sm"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <BarChart3 size={12} className="sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Liquidity</span>
                  <span className="sm:hidden">Vol</span>
                </button>
                <button
                  onClick={() => onModeChange('price')}
                  className={`relative flex items-center justify-center gap-1 min-h-[44px] px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-medium rounded-md transition-all z-10 touch-manipulation ${
                    mapMode === 'price' ? 'text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {mapMode === 'price' && (
                    <motion.div
                      layoutId="price-map-toggle"
                      className="absolute inset-0 bg-[#9A3412] rounded-md -z-10 shadow-sm"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <DollarSign size={12} className="sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Price</span>
                  <span className="sm:hidden">Price</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Map container - responsive height based on viewport */}
      <div ref={mapContainerRef} className="relative h-[50vh] min-h-[400px] md:h-[60vh] md:min-h-[500px] lg:h-[65vh] lg:min-h-[550px]">
        {/* Blur overlay for free users */}
        {isFreeResolved && !loading && (
          <div
            className="absolute inset-0 z-20 pointer-events-none"
            style={{
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              filter: 'grayscale(40%)',
              background: 'rgba(255, 255, 255, 0.05)',
            }}
          />
        )}
        {/* Loading overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white/90 z-30 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-slate-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-500">Loading map...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error state */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-30">
            <div className="text-center">
              <p className="text-slate-500 mb-3">Failed to load data</p>
              <button
                onClick={refetch}
                className="px-4 py-2 bg-slate-600 text-white text-sm font-medium rounded-sm hover:bg-slate-800 transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* MapLibre GL Map */}
        <Map
          ref={mapRef}
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapStyle={MAP_STYLE}
          style={{ width: '100%', height: '100%' }}
          dragPan={true}
          dragRotate={false}
          touchZoomRotate={true}
          scrollZoom={true}
          doubleClickZoom={true}
          keyboard={false}
          maxBounds={MAP_CONFIG.maxBounds}
          minZoom={MAP_CONFIG.minZoom}
          maxZoom={MAP_CONFIG.maxZoom}
          maxPitch={0}
          attributionControl={false}
        >
          {/* District polygons - only render when GeoJSON is loaded */}
          {geoJSON && (
          <Source id="districts" type="geojson" data={geoJSON}>
            {/* Region fills */}
            <Layer
              id="district-fill"
              type="fill"
              paint={{
                'fill-color': fillColorExpression,
                'fill-opacity': 1,
              }}
            />
            {/* District borders */}
            <Layer
              id="district-borders"
              type="line"
              paint={{
                'line-color': '#FFFFFF',
                'line-width': 1.5,
                'line-opacity': 0.8,
              }}
            />
          </Source>
          )}

          {/* District labels */}
          {!loading && districtCentroids.map(district => {
            const data = districtMap[district.district];
            const isHovered = hoveredDistrict?.district?.district === district.district;
            const volumeTier = getVolumeTier(data?.tx_count, volumeThresholds);

            return (
              <Marker
                key={district.district}
                longitude={district.centroid.lng}
                latitude={district.centroid.lat}
                anchor="center"
              >
                <DistrictLabel
                  district={district}
                  data={data}
                  zoom={viewState.zoom}
                  isHovered={isHovered}
                  volumeTier={volumeTier}
                  onHover={(d, data) => {
                    setHoveredDistrict({ district: d, data });
                  }}
                  onLeave={handleLeave}
                />
              </Marker>
            );
          })}
        </Map>

        {/* Leader line (tethered callout connector) - reused from liquidity map */}
        <AnimatePresence>
          {hoveredDistrict && lineCoords && (
            <LeaderLine
              startX={lineCoords.startX}
              startY={lineCoords.startY}
              endX={lineCoords.endX}
              endY={lineCoords.endY}
            />
          )}
        </AnimatePresence>

        {/* Hover card - fixed position next to legend */}
        <AnimatePresence>
          {hoveredDistrict && (
            <HoverCard
              district={hoveredDistrict.district}
              data={hoveredDistrict.data}
            />
          )}
        </AnimatePresence>

        {/* Legend - Market Segments (top-left) - smaller on mobile */}
        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20">
          <div className="bg-white/95 backdrop-blur-sm rounded-sm border border-slate-300 shadow-md p-2 sm:p-2.5 w-[130px] sm:w-[165px]">
            <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 sm:mb-2">
              Market Segments
            </p>
            <div className="space-y-1 sm:space-y-1.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0" style={{ backgroundColor: 'rgba(33, 52, 72, 0.60)' }} />
                <span className="text-[9px] sm:text-[10px] text-slate-800">
                  <span className="sm:hidden">CCR</span>
                  <span className="hidden sm:inline">CCR (Core Central)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0" style={{ backgroundColor: 'rgba(84, 119, 146, 0.50)' }} />
                <span className="text-[9px] sm:text-[10px] text-slate-800">
                  <span className="sm:hidden">RCR</span>
                  <span className="hidden sm:inline">RCR (Rest of Central)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0" style={{ backgroundColor: 'rgba(148, 180, 193, 0.35)' }} />
                <span className="text-[9px] sm:text-[10px] text-slate-800">
                  <span className="sm:hidden">OCR</span>
                  <span className="hidden sm:inline">OCR (Outside Central)</span>
                </span>
              </div>
            </div>

            <div className="h-px bg-slate-200 my-1.5 sm:my-2" />

            <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1 sm:mb-2">
              Price Tier
            </p>
            <div className="space-y-1 sm:space-y-1.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded bg-slate-800 shrink-0" />
                <span className="text-[9px] sm:text-[10px] text-slate-800">&gt;$2.2K</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded bg-slate-600 shrink-0" />
                <span className="text-[9px] sm:text-[10px] text-slate-800">$1.4-2.2K</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded bg-white border border-slate-300 shrink-0" />
                <span className="text-[9px] sm:text-[10px] text-slate-800">&lt;$1.4K</span>
              </div>
            </div>

            {/* Volume Activity - hidden on mobile for space */}
            <div className="hidden sm:block">
              <div className="h-px bg-slate-200 my-2" />

              <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">
                Volume Activity
              </p>
              {/* Gradient bar from red to yellow - full width */}
              <div
                className="h-2.5 rounded-sm"
                style={{
                  background: 'linear-gradient(to right, #EF4444, #F97316, #FACC15)',
                  width: '100%'
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[8px] text-slate-500">High</span>
                <span className="text-[8px] text-slate-500">Low</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Region summary bar */}
      {!loading && !error && districtData.length > 0 && (
        <div className={isFreeResolved ? 'blur-sm grayscale-[40%]' : ''}>
          <RegionSummaryBar districtData={districtData} selectedPeriod={selectedPeriod} />
        </div>
      )}

      <style>{`
        .maplibregl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

const MarketStrategyMap = React.memo(MarketStrategyMapBase);

export default MarketStrategyMap;
