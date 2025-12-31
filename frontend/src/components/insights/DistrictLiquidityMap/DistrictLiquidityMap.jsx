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

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import { BarChart3, DollarSign } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../../api/client';
// GeoJSON is lazy-loaded to reduce initial bundle size (~100KB savings)
import { DISTRICT_CENTROIDS } from '../../../data/districtCentroids';
import { useSubscription } from '../../../context/SubscriptionContext';
import { useStaleRequestGuard } from '../../../hooks';
import { SaleType } from '../../../schemas/apiContract';

// Local imports
import {
  MAP_CONFIG,
  MAP_STYLE,
  LIQUIDITY_FILLS,
  BEDROOM_OPTIONS,
  PERIOD_OPTIONS,
} from './constants';
import { getLiquidityFill } from './utils';
import {
  DistrictLabel,
  HoverCard,
  RegionSummaryBar,
  LiquidityRankingTable,
} from './components';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const DistrictLiquidityMap = React.memo(function DistrictLiquidityMap({
  saleType = SaleType.RESALE,
  selectedPeriod: controlledPeriod,
  selectedBed: controlledBed,
  onFilterChange,
  mapMode,
  onModeChange,
  enabled = true,
}) {
  const { isPremium } = useSubscription();
  const [districtData, setDistrictData] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredDistrict, setHoveredDistrict] = useState(null);

  // Lazy-load GeoJSON to reduce initial bundle size (~100KB savings)
  const [geoJSON, setGeoJSON] = useState(null);
  useEffect(() => {
    import('../../../data/singaporeDistrictsGeoJSON').then((module) => {
      setGeoJSON(module.singaporeDistrictsGeoJSON);
    });
  }, []);

  // Support both controlled and uncontrolled modes (like MarketStrategyMap)
  const [internalBed, setInternalBed] = useState('all');
  const [internalPeriod, setInternalPeriod] = useState('all');

  // Use controlled values if provided, otherwise use internal state
  const isControlled = onFilterChange !== undefined;
  const selectedBed = isControlled ? controlledBed : internalBed;
  const selectedPeriod = isControlled ? controlledPeriod : internalPeriod;

  // Unified setters that work in both modes
  const setSelectedBed = (value) => {
    if (isControlled) {
      onFilterChange('bed', value);
    } else {
      setInternalBed(value);
    }
  };

  const setSelectedPeriod = (value) => {
    if (isControlled) {
      onFilterChange('period', value);
    } else {
      setInternalPeriod(value);
    }
  };

  // Abort/stale request protection
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Stable filter key for dependency tracking (avoids object reference issues)
  const filterKey = useMemo(
    () => `${selectedPeriod}:${selectedBed}:${saleType}`,
    [selectedPeriod, selectedBed, saleType]
  );

  const [viewState, setViewState] = useState({
    longitude: MAP_CONFIG.center.longitude,
    latitude: MAP_CONFIG.center.latitude,
    zoom: MAP_CONFIG.defaultZoom,
    pitch: 0,
    bearing: 0,
  });

  // Fetch data with abort/stale protection
  const fetchData = useCallback(async () => {
    const requestId = startRequest();
    const signal = getSignal();

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/insights/district-liquidity', {
        params: {
          period: selectedPeriod,
          bed: selectedBed,
          saleType, // Use prop value (page-level enforcement)
        },
        signal, // Pass abort signal to cancel on filter change
      });

      // Guard: Don't update state if a newer request started
      if (isStale(requestId)) return;

      setDistrictData(response.data.districts || []);
      setMeta(response.data.meta || {});
      setLoading(false);
    } catch (err) {
      // CRITICAL: Never treat abort/cancel as a real error
      // This prevents "Failed to load" flash when switching filters rapidly
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }

      // Guard: Check stale after error too
      if (isStale(requestId)) return;

      console.error('Failed to fetch district liquidity data:', err);
      setError('Failed to load data');
      setLoading(false);
    }
  }, [selectedBed, selectedPeriod, saleType, startRequest, getSignal, isStale]);

  useEffect(() => {
    if (!enabled) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, enabled]); // Use stable filterKey instead of fetchData to avoid stale closure issues

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

  // Dynamic fill color expression based on liquidity
  const fillColorExpression = useMemo(() => {
    const expr = ['case'];

    districtData.forEach((d) => {
      if (d.has_data) {
        expr.push(['==', ['get', 'district'], d.district_id]);
        expr.push(getLiquidityFill(d.liquidity_metrics?.z_score));
      }
    });

    // Default for districts with no data
    expr.push(LIQUIDITY_FILLS.noData);
    return expr;
  }, [districtData]);

  const handleLeave = useCallback(() => {
    setHoveredDistrict(null);
  }, []);

  return (
    <div className="bg-card rounded-xl border border-[#94B4C1]/50 shadow-sm overflow-hidden">
      {/* Header with filters */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-[#94B4C1]/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#213448]">Volume/Liquidity Analysis by District</h2>
            <p className="text-[10px] sm:text-xs text-[#547792]">
              <span className="hidden sm:inline">
                Transaction velocity by postal district (Z-score normalized)
              </span>
              <span className="sm:hidden">Velocity by district</span>
            </p>
          </div>

          {/* Toggle + Filter pills */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Color-Sync Liquid Toggle */}
            {onModeChange && (
              <div className="flex items-center gap-0.5 sm:gap-1 bg-[#EAE0CF]/50 rounded-lg p-0.5 sm:p-1">
                <button
                  onClick={() => onModeChange('volume')}
                  className={`relative flex items-center justify-center gap-1 min-h-[44px] px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-medium rounded-md transition-all z-10 touch-manipulation ${
                    mapMode === 'volume' ? 'text-white' : 'text-[#547792] hover:text-[#213448]'
                  }`}
                >
                  {mapMode === 'volume' && (
                    <motion.div
                      layoutId="liquidity-map-toggle"
                      className="absolute inset-0 bg-[#213448] rounded-md -z-10 shadow-sm"
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
                    mapMode === 'price' ? 'text-white' : 'text-[#547792] hover:text-[#213448]'
                  }`}
                >
                  {mapMode === 'price' && (
                    <motion.div
                      layoutId="liquidity-map-toggle"
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

            {/* Bedroom filter */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-[#EAE0CF]/50 rounded-lg p-0.5 sm:p-1">
              {BEDROOM_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedBed(option.value)}
                  className={`
                    min-h-[44px] px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-medium rounded-md transition-all touch-manipulation
                    ${
                      selectedBed === option.value
                        ? 'bg-white text-[#213448] shadow-sm'
                        : 'text-[#547792] hover:text-[#213448]'
                    }
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Period filter */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-[#EAE0CF]/50 rounded-lg p-0.5 sm:p-1">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedPeriod(option.value)}
                  className={`
                    min-h-[44px] px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-medium rounded-md transition-all touch-manipulation
                    ${
                      selectedPeriod === option.value
                        ? 'bg-white text-[#213448] shadow-sm'
                        : 'text-[#547792] hover:text-[#213448]'
                    }
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Map container */}
      <div className="relative h-[50vh] min-h-[400px] md:h-[60vh] md:min-h-[500px] lg:h-[65vh] lg:min-h-[550px]">
        {/* Blur overlay for free users */}
        {!isPremium && !loading && (
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
                <div className="w-8 h-8 border-3 border-[#547792] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[#547792]">Loading map...</span>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Error state */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-30">
            <div className="text-center">
              <p className="text-[#547792] mb-3">{error}</p>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-[#547792] text-white text-sm font-medium rounded-lg hover:bg-[#213448] transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* MapLibre GL Map */}
        <Map
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

        {/* Hover card */}
        <AnimatePresence>
          {hoveredDistrict && (
            <HoverCard district={hoveredDistrict.district} data={hoveredDistrict.data} />
          )}
        </AnimatePresence>

        {/* Legend - Liquidity Tiers (top-left) - smaller on mobile */}
        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg border border-[#94B4C1]/50 shadow-md p-2 sm:p-2.5 w-[140px] sm:w-[180px]">
            {/* Header with methodology tooltip */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold">
                Liquidity Tier
              </p>
              <div className="group relative">
                <div className="w-4 h-4 rounded-full bg-[#EAE0CF]/50 flex items-center justify-center cursor-help hover:bg-[#94B4C1]/30 transition-colors">
                  <svg
                    className="w-2.5 h-2.5 text-[#547792]"
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
                <div className="absolute left-0 top-full mt-1 w-56 p-2.5 bg-[#213448] text-white text-[10px] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <p className="font-semibold text-[#EAE0CF] mb-1.5">Methodology</p>
                  <div className="space-y-1.5 text-[#94B4C1]">
                    <p>
                      <span className="text-emerald-300 font-medium">Exit Safety</span> (Tier,
                      Velocity, Z-Score): Calculated on <span className="text-white">resale only</span>{' '}
                      to reflect organic demand.
                    </p>
                    <p>
                      <span className="text-rose-300 font-medium">Concentration</span> (Gini,
                      Fragility): Calculated on <span className="text-white">resale only</span> to
                      avoid developer release distortion.
                    </p>
                    <p>
                      <span className="text-[#EAE0CF] font-medium">Market Structure</span> (Tx,
                      Projects): Includes <span className="text-white">all sale types</span>.
                    </p>
                  </div>
                  <div className="absolute -top-1 left-3 w-2 h-2 bg-[#213448] rotate-45" />
                </div>
              </div>
            </div>

            {/* Resale-only badge - hidden on mobile */}
            <div className="hidden sm:block mb-2 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded text-[8px] text-emerald-700 text-center">
              Based on resale transactions
            </div>

            <div className="space-y-1 sm:space-y-1.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0"
                  style={{ backgroundColor: LIQUIDITY_FILLS.veryHigh }}
                />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">
                  <span className="sm:hidden">V.High</span>
                  <span className="hidden sm:inline">Very High (&gt;1.5σ)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0"
                  style={{ backgroundColor: LIQUIDITY_FILLS.high }}
                />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">
                  <span className="sm:hidden">High</span>
                  <span className="hidden sm:inline">High (0.5 to 1.5σ)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0"
                  style={{ backgroundColor: LIQUIDITY_FILLS.neutral }}
                />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">
                  <span className="sm:hidden">Neutral</span>
                  <span className="hidden sm:inline">Neutral (-0.5 to 0.5σ)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0"
                  style={{ backgroundColor: LIQUIDITY_FILLS.low }}
                />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">
                  <span className="sm:hidden">Low</span>
                  <span className="hidden sm:inline">Low (-1.5 to -0.5σ)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0"
                  style={{ backgroundColor: LIQUIDITY_FILLS.veryLow }}
                />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">
                  <span className="sm:hidden">V.Low</span>
                  <span className="hidden sm:inline">Very Low (&lt;-1.5σ)</span>
                </span>
              </div>
            </div>

            {/* Stats summary - hidden on mobile */}
            {meta.total_transactions > 0 && (
              <div className="hidden sm:block">
                <div className="h-px bg-[#94B4C1]/30 my-2" />
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#547792]">Total Tx</span>
                    <span className="font-semibold text-[#213448]">
                      {meta.total_transactions?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#547792]">Avg Turnover</span>
                    <span className="font-semibold text-[#213448]">
                      {meta.mean_turnover_rate?.toFixed(1) ?? meta.mean_velocity?.toFixed(1)} per 100 units
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Region summary bar */}
      {!loading && !error && districtData.length > 0 && (
        <div className={!isPremium ? 'blur-sm grayscale-[40%]' : ''}>
          <RegionSummaryBar districtData={districtData} meta={meta} />
        </div>
      )}

      {/* District Ranking Table */}
      {!loading && !error && districtData.length > 0 && (
        <div className={!isPremium ? 'blur-sm grayscale-[40%]' : ''}>
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
});

export default DistrictLiquidityMap;
