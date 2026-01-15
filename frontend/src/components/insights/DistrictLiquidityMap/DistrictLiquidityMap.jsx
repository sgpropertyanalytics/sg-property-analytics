/**
 * DistrictLiquidityMap - District Liquidity Heatmap
 *
 * Features:
 * - Choropleth map showing liquidity (transaction velocity) by district
 * - Z-score based coloring (relative comparison)
 * - Filters: Period, Bedroom, Sale Type
 * - Hover cards with velocity, tier, sale type breakdown
 * - Region summary bar
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import { BarChart3, DollarSign } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../../api/client';
// GeoJSON is lazy-loaded to reduce initial bundle size (~100KB savings)
import { DISTRICT_CENTROIDS } from '../../../data/districtCentroids';
import { useSubscription } from '../../../context/SubscriptionContext';
// Phase 2: Using TanStack Query via useAppQuery wrapper
import { useAppQuery, QueryStatus } from '../../../hooks';
// Phase 3.4: Using standardized Zustand filters (same as Market Overview)
import { useZustandFilters } from '../../../stores';
import { SaleType } from '../../../schemas/apiContract';
import { assertKnownVersion } from '../../../adapters';

// Local imports
import {
  MAP_CONFIG,
  MAP_STYLE,
  REGION_FILLS,
  REGION_FILL_DIMMED,
  LIQUIDITY_BORDERS,
} from './constants';
import { getRegionForDistrict, REGIONS } from '../../../constants';
import {
  DistrictLabel,
  HoverCard,
  LeaderLine,
  RegionSummaryBar,
  LiquidityRankingTable,
} from './components';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * @param {{
 *  saleType?: string,
 *  mapMode?: string,
 *  onModeChange?: (value: string) => void,
 *  enabled?: boolean,
 * }} props
 */
function DistrictLiquidityMapBase({
  saleType = SaleType.RESALE,
  mapMode,
  onModeChange,
  enabled = true,
}) {
  const { tier, tierSource } = useSubscription();
  const isFreeTier = tierSource !== 'none' && tier === 'free';
  const [hoveredDistrict, setHoveredDistrict] = useState(null);

  // Phase 4: Simplified filter access - read values directly from Zustand
  // No buildApiParams abstraction, no debouncedFilterKey (TanStack handles cache keys)
  const { filters } = useZustandFilters();

  // Extract filter values directly (simple, explicit)
  const timeframe = filters.timeFilter?.type === 'preset'
    ? filters.timeFilter.value
    : 'Y1';
  const bedroom = filters.bedroomTypes?.join(',') || '';
  // Region filter (segments) - used for region-based spotlight effect
  const segments = filters.segments || [];

  // For display in child components
  const selectedBed = bedroom || 'all';
  const selectedPeriod = timeframe;

  // Determine if region filter is active (not empty and not all regions selected)
  const isRegionFilterActive = segments.length > 0 && segments.length < REGIONS.length;

  // Lazy-load GeoJSON to reduce initial bundle size (~100KB savings)
  const [geoJSON, setGeoJSON] = useState(null);
  useEffect(() => {
    import('../../../data/singaporeDistrictsGeoJSON').then((module) => {
      setGeoJSON(module.singaporeDistrictsGeoJSON);
    });
  }, []);

  // Phase 4: Simplified data fetching - no adapter layer, inline params
  // Backend now accepts frontend param names directly (timeframe, bedroom)
  const { data, status, error, refetch } = useAppQuery(
    async (signal) => {
      const response = await apiClient.get('/insights/district-liquidity', {
        params: {
          timeframe,  // Backend accepts 'timeframe' directly
          bedroom,    // Backend accepts 'bedroom' directly (alias for 'bed')
          saleType,
        },
        signal,
      });
      // Contract validation - detect shape changes early
      assertKnownVersion(response.data, '/api/insights/district-liquidity');
      return {
        districts: response.data.districts || [],
        meta: response.data.meta || {},
      };
    },
    // Simple query key - TanStack Query handles cache deduplication automatically
    ['district-liquidity', timeframe, bedroom, saleType],
    { chartName: 'DistrictLiquidityMap', enabled, initialData: null }
  );

  const districtData = data?.districts || [];
  const meta = data?.meta || {};

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
    districtData.forEach((d) => {
      map[d.district_id] = d;
    });
    return map;
  }, [districtData]);

  // Use precomputed district centroids (calculated at module load time)
  const districtCentroids = DISTRICT_CENTROIDS;

  // Refs for map container and map instance (for position calculations)
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // Dynamic fill color expression based on REGION (same as Price map)
  // Supports both hover-based and region-filter-based highlighting
  const fillColorExpression = useMemo(() => {
    const hoveredId = hoveredDistrict?.district?.district;
    const expr = ['case'];

    districtData.forEach((d) => {
      if (d.has_data) {
        expr.push(['==', ['get', 'district'], d.district_id]);

        // Determine if this district should be dimmed
        const districtRegion = getRegionForDistrict(d.district_id);
        const isInSelectedRegion = !isRegionFilterActive || segments.includes(districtRegion);
        const isHoveredDistrict = hoveredId === d.district_id;

        // Dimming logic:
        // 1. If region filter is active and district is NOT in selected region → dim
        // 2. If hovering and district is NOT the hovered one → dim (within active region)
        const shouldDim = !isInSelectedRegion || (hoveredId && !isHoveredDistrict);

        if (shouldDim) {
          expr.push(REGION_FILL_DIMMED);
        } else {
          // Fill by region (CCR/RCR/OCR) - same as Price map
          expr.push(REGION_FILLS[districtRegion] || REGION_FILLS.OCR);
        }
      }
    });

    // If no conditions were added, return literal color (not malformed case expression)
    // MapLibre 'case' requires at least 3 arguments: ['case', condition, result, fallback]
    if (expr.length === 1) {
      const shouldDimDefault = hoveredId || isRegionFilterActive;
      return shouldDimDefault ? REGION_FILL_DIMMED : 'rgba(200, 200, 200, 0.15)';
    }

    // Default for districts with no data
    const shouldDimDefault = hoveredId || isRegionFilterActive;
    expr.push(shouldDimDefault ? REGION_FILL_DIMMED : 'rgba(200, 200, 200, 0.15)');
    return expr;
  }, [districtData, hoveredDistrict, isRegionFilterActive, segments]);

  // Calculate screen position of hovered district for tethered callout
  // Card is fixed below the legend, only the leader line moves
  const { cardPosition, lineCoords } = useMemo(() => {
    if (!hoveredDistrict?.district || !mapContainerRef.current) {
      return { cardPosition: null, lineCoords: null };
    }

    const centroid = hoveredDistrict.district.centroid;
    if (!centroid) return { cardPosition: null, lineCoords: null };

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

    // Fixed card position: below the legend with small gap
    // Card CSS: top-[152px] sm:top-[240px] left-2 sm:left-4
    const cardWidth = 220;
    const cardLeft = 16; // Matches sm:left-4 (16px)
    const cardTop = 240; // Matches sm:top-[240px]
    const headerHeight = 36; // Height of the tier-colored header

    // Leader line: start = card header, end = district
    // This creates cleaner "master-detail" relationship
    const cardRightEdge = cardLeft + cardWidth; // Right edge of card (236px)
    const cardHeaderMiddle = cardTop + headerHeight / 2; // Middle of header (~258px)

    return {
      cardPosition: null, // Card uses CSS classes now
      lineCoords: {
        // START = Card header (where line originates)
        startX: cardRightEdge,
        startY: cardHeaderMiddle,
        // END = District center (where line terminates)
        endX: districtX,
        endY: districtY,
      },
    };
  }, [hoveredDistrict, viewState]);

  // Get border color for leader line based on score tier
  const _leaderLineColor = useMemo(() => {
    if (!hoveredDistrict?.data?.liquidity_metrics?.score_tier) return '#334155';
    const tier = hoveredDistrict.data.liquidity_metrics.score_tier;
    switch (tier) {
      case 'Excellent': return '#213448';
      case 'Good': return '#547792';
      case 'Average': return '#94B4C1';
      case 'Below Average': return '#d4c4a8';
      case 'Poor': return '#c4b498';
      default: return '#334155';
    }
  }, [hoveredDistrict]);

  const handleLeave = useCallback(() => {
    setHoveredDistrict(null);
  }, []);

  return (
    <div className="bg-white rounded-sm border border-slate-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Header with filters */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Volume/Liquidity Analysis by District</h2>
            <p className="text-[10px] text-slate-500 font-mono">
              <span className="hidden sm:inline">
                Transaction velocity by postal district (Z-score normalized)
              </span>
              <span className="sm:hidden">Velocity by district</span>
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
                  className={`relative flex items-center justify-center gap-1 min-h-[44px] px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-medium rounded-sm transition-all z-10 touch-manipulation ${
                    mapMode === 'volume' ? 'text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {mapMode === 'volume' && (
                    <motion.div
                      layoutId="liquidity-map-toggle"
                      className="absolute inset-0 bg-slate-800 rounded-sm -z-10 shadow-sm"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <BarChart3 size={12} className="sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Liquidity</span>
                  <span className="sm:hidden">Vol</span>
                </button>
                <button
                  onClick={() => onModeChange('price')}
                  className={`relative flex items-center justify-center gap-1 min-h-[44px] px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-medium rounded-sm transition-all z-10 touch-manipulation ${
                    mapMode === 'price' ? 'text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {mapMode === 'price' && (
                    <motion.div
                      layoutId="liquidity-map-toggle"
                      className="absolute inset-0 bg-slate-800 rounded-sm -z-10 shadow-sm"
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

      {/* Map container */}
      <div ref={mapContainerRef} className="relative h-[50vh] min-h-[400px] md:h-[60vh] md:min-h-[500px] lg:h-[65vh] lg:min-h-[550px]">
        {/* Blur overlay for free users */}
        {isFreeTier && !loading && (
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
            <div className="absolute inset-0 bg-white/90 z-30 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-600">Loading map...</span>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Error state */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-30">
            <div className="text-center">
              <p className="text-slate-600 mb-3">Failed to load data</p>
              <button
                onClick={refetch}
                className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-sm hover:bg-slate-700 transition-colors"
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
          onMove={(evt) => setViewState(evt.viewState)}
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
            {/* Liquidity fills */}
            <Layer
              id="district-fill"
              type="fill"
              paint={{
                'fill-color': fillColorExpression,
                'fill-opacity': 1,
              }}
            />
            {/* District borders - white to match Price map */}
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
          {!loading &&
            districtCentroids.map((district) => {
              const data = districtMap[district.district];
              const isHovered = hoveredDistrict?.district?.district === district.district;

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
                    onHover={(d, data) => {
                      setHoveredDistrict({ district: d, data });
                    }}
                    onLeave={handleLeave}
                  />
                </Marker>
              );
            })}
        </Map>

        {/* Leader line (tethered callout connector) */}
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

        {/* Hover card (tethered callout) */}
        <AnimatePresence>
          {hoveredDistrict && (
            <HoverCard
              district={hoveredDistrict.district}
              data={hoveredDistrict.data}
              position={cardPosition}
            />
          )}
        </AnimatePresence>

        {/* Legend - Market Segments + Liquidity Score (top-left) - matches HoverCard style */}
        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20">
          <div
            className="bg-white/95 backdrop-blur-sm rounded-none w-[140px] sm:w-[220px] overflow-hidden"
            style={{ border: '1.5px solid #94B4C1' }}
          >
            {/* Header - matches HoverCard header style */}
            <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-600 text-white">
              <span className="font-bold text-[10px] sm:text-xs tracking-wide">Legend</span>
            </div>

            {/* Card body */}
            <div className="p-2 sm:p-3">
              {/* Market Segments (fill colors) - same as Price map */}
              <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 sm:mb-2">
                Market Segments
              </p>
            <div className="space-y-1 sm:space-y-1.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0" style={{ backgroundColor: REGION_FILLS.CCR }} />
                <span className="text-[9px] sm:text-[10px] text-slate-800">
                  <span className="sm:hidden">CCR</span>
                  <span className="hidden sm:inline">CCR (Core Central)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0" style={{ backgroundColor: REGION_FILLS.RCR }} />
                <span className="text-[9px] sm:text-[10px] text-slate-800">
                  <span className="sm:hidden">RCR</span>
                  <span className="hidden sm:inline">RCR (Rest of Central)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0" style={{ backgroundColor: REGION_FILLS.OCR }} />
                <span className="text-[9px] sm:text-[10px] text-slate-800">
                  <span className="sm:hidden">OCR</span>
                  <span className="hidden sm:inline">OCR (Outside Central)</span>
                </span>
              </div>
            </div>

            <div className="h-px bg-slate-200 my-1.5 sm:my-2" />

            {/* Liquidity Score with methodology tooltip */}
            <div className="flex items-center justify-between mb-1 sm:mb-1.5">
              <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                Volume Activity
              </p>
              <div className="group relative">
                <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-slate-100 flex items-center justify-center cursor-help hover:bg-slate-200 transition-colors">
                  <svg
                    className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                {/* Tooltip */}
                <div className="absolute left-0 top-full mt-1 w-56 p-2.5 bg-slate-800 text-white text-[10px] rounded-sm shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <p className="font-semibold text-slate-200 mb-1.5">Composite Score (0-100)</p>
                  <div className="space-y-1.5 text-slate-300">
                    <p>
                      <span className="text-emerald-300 font-medium">Exit Safety 60%</span>: Velocity
                      (35%), Breadth (15%), Concentration (10%) - resale only.
                    </p>
                    <p>
                      <span className="text-amber-300 font-medium">Market Health 40%</span>: Volume
                      (18%), Diversity (9%), Stability (8%), Organic (5%).
                    </p>
                  </div>
                  <div className="absolute -top-1 left-3 w-2 h-2 bg-slate-800 rotate-45" />
                </div>
              </div>
            </div>
            {/* Gradient heatbar from High to Low liquidity */}
            <div
              className="h-2.5 rounded-sm"
              style={{
                background: `linear-gradient(to right, ${LIQUIDITY_BORDERS.veryHigh}, ${LIQUIDITY_BORDERS.high}, ${LIQUIDITY_BORDERS.neutral}, ${LIQUIDITY_BORDERS.low}, ${LIQUIDITY_BORDERS.veryLow})`,
                width: '100%'
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-slate-500">High</span>
              <span className="text-[8px] text-slate-500">Low</span>
            </div>

            {/* Stats summary - hidden on mobile */}
            {meta.total_transactions > 0 && (
              <div className="hidden sm:block">
                <div className="h-px bg-slate-200 my-2" />
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Total Tx</span>
                    <span className="font-semibold text-slate-800 font-mono">
                      {meta.total_transactions?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500 whitespace-nowrap">Avg Turnover</span>
                    <span className="font-semibold text-slate-800 font-mono whitespace-nowrap">
                      {meta.mean_turnover_rate?.toFixed(1) ?? meta.mean_velocity?.toFixed(1)} per 100 units
                    </span>
                  </div>
                </div>
              </div>
            )}
            </div>{/* Close card body */}
          </div>{/* Close legend card */}
        </div>{/* Close legend container */}
      </div>

      {/* Region summary bar */}
      {!loading && !error && districtData.length > 0 && (
        <div className={isFreeTier ? 'blur-sm grayscale-[40%]' : ''}>
          <RegionSummaryBar districtData={districtData} meta={meta} />
        </div>
      )}

      {/* District Ranking Table */}
      {!loading && !error && districtData.length > 0 && (
        <div className={isFreeTier ? 'blur-sm grayscale-[40%]' : ''}>
          <LiquidityRankingTable
            districtData={districtData}
            selectedBed={selectedBed}
            selectedSaleType={SaleType.RESALE}
            selectedPeriod={selectedPeriod}
          />
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

const DistrictLiquidityMap = React.memo(DistrictLiquidityMapBase);

export default DistrictLiquidityMap;
