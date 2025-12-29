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

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../api/client';
import { singaporeDistrictsGeoJSON, SINGAPORE_CENTER } from '../../data/singaporeDistrictsGeoJSON';
import { REGIONS, CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS, getRegionBadgeClass, BEDROOM_FILTER_OPTIONS, PERIOD_FILTER_OPTIONS } from '../../constants';
import { useSubscription } from '../../context/SubscriptionContext';
import { useStaleRequestGuard } from '../../hooks';
import { SaleType } from '../../schemas/apiContract';

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

// Region fill colors (strong shading for clear market segment separation)
const REGION_FILLS = {
  CCR: 'rgba(33, 52, 72, 0.40)',   // Deep Navy - Premium/Core Central
  RCR: 'rgba(84, 119, 146, 0.32)', // Ocean Blue - City Fringe
  OCR: 'rgba(148, 180, 193, 0.25)', // Sky Blue - Suburban
};

// Volume glow colors (warm palette - only top 30% get glow)
const VOLUME_GLOW = {
  hot: 'drop-shadow(0 0 12px rgba(239, 68, 68, 0.75))',    // Red - Top 10%
  warm: 'drop-shadow(0 0 10px rgba(249, 115, 22, 0.65))',  // Orange - 10-20%
  mild: 'drop-shadow(0 0 8px rgba(250, 204, 21, 0.55))',   // Yellow - 20-30%
};

// Use centralized filter options
const BEDROOM_OPTIONS = BEDROOM_FILTER_OPTIONS;
const PERIOD_OPTIONS = PERIOD_FILTER_OPTIONS;

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

  const getPercentile = (arr, p) => {
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };

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

  // Color based on PSF tier
  const getPriceStyle = () => {
    if (!hasData) return 'bg-[#EAE0CF] text-[#94B4C1] border-[#94B4C1]/30';
    if (psf >= 2200) return 'bg-[#213448] text-white border-[#213448]';
    if (psf >= 1400) return 'bg-[#547792] text-white border-[#547792]';
    return 'bg-white text-[#213448] border-[#94B4C1]';
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
          shadow-sm border border-[#94B4C1]/30
          transition-all duration-200
          ${isHovered ? 'bg-white shadow-md' : ''}
        `}
        style={{ filter: glowStyle }}
      >
        <div className="flex flex-col items-center">
          {/* District number */}
          <span className="text-[9px] font-semibold text-[#213448]">
            {district.district}
          </span>
          {/* Area name - shown when zoomed in */}
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
      <div className="bg-white rounded-lg shadow-xl border border-[#94B4C1]/50 p-2 sm:p-3 w-[140px] sm:w-[165px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-[#213448] text-sm">
            {district.district}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${getRegionBadgeClass(district.region)}`}>
            {district.region}
          </span>
        </div>

        {/* District name */}
        <p className="text-xs text-[#547792] mb-2 leading-tight">
          {district.name}
        </p>

        <div className="h-px bg-[#94B4C1]/30 mb-2" />

        {/* Stats */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#547792]">Median PSF</span>
            <span className="font-bold text-[#213448] text-sm">
              {formatPsf(data.median_psf)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-[#547792]">Observations</span>
            <span className="font-semibold text-[#213448] text-xs">
              {data.tx_count?.toLocaleString() || 0}
            </span>
          </div>

          {hasYoY && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#547792]">YoY Change</span>
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

function RegionSummaryBar({ districtData }) {
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
        return { region, medianPsf: null, txCount: 0, yoyPct: null };
      }

      // Weighted average PSF by transaction count
      const totalTx = districts.reduce((sum, d) => sum + (d.tx_count || 0), 0);
      const weightedPsf = districts.reduce(
        (sum, d) => sum + (d.median_psf || 0) * (d.tx_count || 0),
        0
      ) / (totalTx || 1);

      // Average YoY
      const districtsWithYoY = districts.filter(d => d.yoy_pct !== null);
      const avgYoY = districtsWithYoY.length > 0
        ? districtsWithYoY.reduce((sum, d) => sum + d.yoy_pct, 0) / districtsWithYoY.length
        : null;

      return {
        region,
        medianPsf: weightedPsf,
        txCount: totalTx,
        yoyPct: avgYoY,
      };
    });
  }, [districtData]);

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
      {regionStats.map(stat => (
        <div
          key={stat.region}
          className={`rounded-lg border p-2 sm:p-3 ${regionStyles[stat.region]}`}
        >
          {/* Mobile: horizontal layout, Desktop: vertical */}
          <div className="flex sm:flex-col items-center sm:items-stretch gap-2 sm:gap-0">
            {/* Region name and YoY */}
            <div className="flex items-center justify-between sm:mb-1 min-w-[60px] sm:min-w-0">
              <span className="font-semibold text-[#213448] text-sm">
                {stat.region}
              </span>
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
            <p className="hidden sm:block text-[10px] text-[#547792] mb-2">
              {regionLabels[stat.region].desc}
            </p>
            {/* Stats */}
            <div className="flex items-baseline gap-2 sm:justify-between flex-1 sm:flex-none">
              <span className="text-base sm:text-lg font-bold text-[#213448]">
                {stat.medianPsf ? formatPsf(stat.medianPsf) : '-'}
              </span>
              <span className="text-[10px] sm:text-xs text-[#547792]">
                {stat.txCount.toLocaleString()} tx
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
 * Supports both controlled and uncontrolled modes:
 * - Controlled: Pass selectedPeriod, selectedBed, selectedSaleType, onFilterChange props
 * - Uncontrolled: Uses internal state (legacy behavior)
 *
 * @param {string} selectedSaleType - Sale type enum value (page-level enforcement)
 */
export default function MarketStrategyMap({
  selectedPeriod: controlledPeriod,
  selectedBed: controlledBed,
  selectedSaleType = SaleType.RESALE,
  onFilterChange,
}) {
  const { isPremium } = useSubscription();
  const [districtData, setDistrictData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredDistrict, setHoveredDistrict] = useState(null);

  // Support both controlled and uncontrolled modes
  const [internalBed, setInternalBed] = useState('all');
  const [internalPeriod, setInternalPeriod] = useState('12m');

  // Use controlled values if provided, otherwise use internal state
  const isControlled = onFilterChange !== undefined;
  const selectedBed = isControlled ? controlledBed : internalBed;
  const selectedPeriod = isControlled ? controlledPeriod : internalPeriod;

  // Unified setter that works in both modes
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
    () => `${selectedPeriod}:${selectedBed}:${selectedSaleType}`,
    [selectedPeriod, selectedBed, selectedSaleType]
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
      const response = await apiClient.get('/insights/district-psf', {
        params: { period: selectedPeriod, bed: selectedBed, sale_type: selectedSaleType },
        signal,  // Pass abort signal to cancel on filter change
      });

      // Guard: Don't update state if a newer request started
      if (isStale(requestId)) return;

      setDistrictData(response.data.districts || []);
      setLoading(false);
    } catch (err) {
      // CRITICAL: Never treat abort/cancel as a real error
      // This prevents "Failed to load" flash when switching filters rapidly
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }

      // Guard: Check stale after error too
      if (isStale(requestId)) return;

      console.error('Failed to fetch district PSF data:', err);
      setError('Failed to load data');
      setLoading(false);
    }
  }, [selectedBed, selectedPeriod, selectedSaleType, startRequest, getSignal, isStale]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]); // Use stable filterKey instead of fetchData to avoid stale closure issues

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

  // Calculate district centroids
  const districtCentroids = useMemo(() => {
    return singaporeDistrictsGeoJSON.features.map(feature => {
      const centroid = polylabel(feature.geometry.coordinates);
      const districtId = feature.properties.district;
      const offset = MARKER_OFFSETS[districtId] || { lng: 0, lat: 0 };

      return {
        district: districtId,
        name: feature.properties.name,
        region: feature.properties.region,
        centroid: centroid ? {
          lng: centroid.lng + offset.lng,
          lat: centroid.lat + offset.lat,
        } : null,
      };
    }).filter(d => d.centroid !== null);
  }, []);

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
    <div className="bg-white rounded-xl border border-[#94B4C1]/50 shadow-sm overflow-hidden">
      {/* Header with filters */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-[#94B4C1]/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#213448]">
              District Price Overview
            </h2>
            <p className="text-[10px] sm:text-xs text-[#547792]">
              <span className="hidden sm:inline">Median PSF by postal district</span>
              <span className="sm:hidden">Median PSF by district</span>
            </p>
          </div>

          {/* Filter pills - more compact on mobile */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Bedroom filter */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-[#EAE0CF]/50 rounded-lg p-0.5 sm:p-1">
              {BEDROOM_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSelectedBed(option.value)}
                  className={`
                    px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-md transition-all
                    ${selectedBed === option.value
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
              {PERIOD_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSelectedPeriod(option.value)}
                  className={`
                    px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-md transition-all
                    ${selectedPeriod === option.value
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

      {/* Map container - responsive height based on viewport */}
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white/90 z-30 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-[#547792] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[#547792]">Loading map...</span>
              </div>
            </motion.div>
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
          {/* District polygons */}
          <Source id="districts" type="geojson" data={singaporeDistrictsGeoJSON}>
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
          <div className="bg-white/95 backdrop-blur-sm rounded-lg border border-[#94B4C1]/50 shadow-md p-2 sm:p-2.5 w-[130px] sm:w-[165px]">
            <p className="text-[8px] sm:text-[9px] text-[#547792] uppercase tracking-wider font-semibold mb-1.5 sm:mb-2">
              Market Segments
            </p>
            <div className="space-y-1 sm:space-y-1.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0" style={{ backgroundColor: 'rgba(33, 52, 72, 0.50)' }} />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">
                  <span className="sm:hidden">CCR</span>
                  <span className="hidden sm:inline">CCR (Core Central)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0" style={{ backgroundColor: 'rgba(84, 119, 146, 0.42)' }} />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">
                  <span className="sm:hidden">RCR</span>
                  <span className="hidden sm:inline">RCR (Rest of Central)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded shrink-0" style={{ backgroundColor: 'rgba(148, 180, 193, 0.35)' }} />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">
                  <span className="sm:hidden">OCR</span>
                  <span className="hidden sm:inline">OCR (Outside Central)</span>
                </span>
              </div>
            </div>

            <div className="h-px bg-[#94B4C1]/30 my-1.5 sm:my-2" />

            <p className="text-[8px] sm:text-[9px] text-[#547792] uppercase tracking-wider font-semibold mb-1 sm:mb-2">
              Price Tier
            </p>
            <div className="space-y-1 sm:space-y-1.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded bg-[#213448] shrink-0" />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">&gt;$2.2K</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded bg-[#547792] shrink-0" />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">$1.4-2.2K</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-3 h-2 sm:w-4 sm:h-3 rounded bg-white border border-[#94B4C1] shrink-0" />
                <span className="text-[9px] sm:text-[10px] text-[#213448]">&lt;$1.4K</span>
              </div>
            </div>

            {/* Volume Activity - hidden on mobile for space */}
            <div className="hidden sm:block">
              <div className="h-px bg-[#94B4C1]/30 my-2" />

              <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold mb-1.5">
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
                <span className="text-[8px] text-[#547792]">High</span>
                <span className="text-[8px] text-[#547792]">Low</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Region summary bar */}
      {!loading && !error && districtData.length > 0 && (
        <div className={!isPremium ? 'blur-sm grayscale-[40%]' : ''}>
          <RegionSummaryBar districtData={districtData} />
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
