/**
 * MarketStrategyMap - "Institutional Grade" Command Center
 *
 * Target Aesthetic: Bloomberg Terminal meets Modern SaaS
 * Core UX: Fixed-context dashboard that allows exploration but prevents getting lost
 *
 * Key Design Decisions:
 * - HARD-CODED center (shifted north to 1.3650) - pushes island UP to clear bottom UI
 * - HARD-CODED zoom (10.6) - "Goldilocks zone" for full visibility on all screens
 * - NO fitBounds - auto-calculation is unreliable across screen aspect ratios
 * - Layer order: Fill FIRST, Line SECOND (line renders on top)
 *
 * Features:
 * - Bounded exploration ("Playpen") - drag enabled with elastic maxBounds
 * - Price/Volume view mode toggle for different insights
 * - Zoom-responsive markers (dots at overview, pills when zoomed)
 * - High-contrast "Blueprint" style white boundaries
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../api/client';
import { singaporeDistrictsGeoJSON, SINGAPORE_CENTER } from '../../data/singaporeDistrictsGeoJSON';

// =============================================================================
// MAP CONFIGURATION - "Hard-Coded" Foolproof Setup
// =============================================================================

const MAP_CONFIG = {
  // "Hard-Coded" Default View - No fitBounds auto-calculation
  // Center is shifted NORTH (~0.013 deg) to push island UP and clear bottom UI
  adjustedCenter: {
    longitude: 103.8198,
    latitude: 1.3650,  // Shifted north from 1.3521 to clear filter bar
  },

  // Goldilocks zoom - 10.6 guarantees full visibility on standard screens
  defaultZoom: 10.6,

  // "Playpen" - elastic walls that prevent users from getting lost
  maxBounds: [
    [103.55, 1.15],  // Southwest (allows slight pan toward Batam)
    [104.15, 1.50],  // Northeast (allows slight pan toward Johor)
  ],

  // Zoom constraints
  minZoom: 10,     // Prevents zooming out to world view
  maxZoom: 16,     // Allows street-level inspection
};

// Theme colors (Warm Precision palette)
const COLORS = {
  deepNavy: '#213448',
  oceanBlue: '#547792',
  skyBlue: '#94B4C1',
  sand: '#EAE0CF',
  void: '#0f172a',  // Deep dark background
};

// Volume "Hot" gradient colors
const VOLUME_COLORS = {
  low: '#FDE68A',      // Pale Yellow
  medium: '#F59E0B',   // Orange
  high: '#B91C1C',     // Red
};

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

/**
 * Polylabel Algorithm - Find visual center of polygon
 */
function polylabel(polygon) {
  const ring = polygon[0];
  if (!ring || ring.length < 4) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);

  if (cellSize === 0) return { lng: minX, lat: minY };

  let bestX = 0, bestY = 0, bestDist = -Infinity;
  let sumX = 0, sumY = 0, sumArea = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    const cross = x1 * y2 - x2 * y1;
    sumX += (x1 + x2) * cross;
    sumY += (y1 + y2) * cross;
    sumArea += cross;
  }

  if (sumArea !== 0) {
    sumArea *= 3;
    bestX = sumX / sumArea;
    bestY = sumY / sumArea;
  } else {
    bestX = (minX + maxX) / 2;
    bestY = (minY + maxY) / 2;
  }

  if (pointInPolygon([bestX, bestY], ring)) {
    return { lng: bestX, lat: bestY };
  }

  const step = cellSize / 10;
  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) {
      if (pointInPolygon([x, y], ring)) {
        const dist = distanceToEdge([x, y], ring);
        if (dist > bestDist) {
          bestDist = dist;
          bestX = x;
          bestY = y;
        }
      }
    }
  }

  return { lng: bestX, lat: bestY };
}

function pointInPolygon(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToEdge(point, ring) {
  const [px, py] = point;
  let minDist = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    const dist = pointToSegmentDistance(px, py, x1, y1, x2, y2);
    minDist = Math.min(minDist, dist);
  }
  return minDist;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;

  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
}

// Color functions for Price mode
function getPsfColor(psf, hasData) {
  if (!hasData || !psf) return '#3a3a4a';
  if (psf < 1400) return COLORS.skyBlue;    // OCR
  if (psf < 2200) return COLORS.oceanBlue;  // RCR
  return COLORS.deepNavy;                    // CCR
}

// Color functions for Volume mode
function getVolumeColor(txCount, hasData, maxVolume) {
  if (!hasData || !txCount) return '#3a3a4a';
  const ratio = txCount / maxVolume;
  if (ratio < 0.33) return VOLUME_COLORS.low;
  if (ratio < 0.66) return VOLUME_COLORS.medium;
  return VOLUME_COLORS.high;
}

// Build MapLibre color expression for Price mode
function getPriceColorExpression(districtData) {
  const colorStops = ['case'];
  districtData.forEach((d) => {
    colorStops.push(['==', ['get', 'district'], d.district_id]);
    colorStops.push(getPsfColor(d.median_psf, d.has_data));
  });
  colorStops.push('#3a3a4a');
  return colorStops;
}

// Build MapLibre color expression for Volume mode
function getVolumeColorExpression(districtData, maxVolume) {
  const colorStops = ['case'];
  districtData.forEach((d) => {
    colorStops.push(['==', ['get', 'district'], d.district_id]);
    colorStops.push(getVolumeColor(d.tx_count, d.has_data, maxVolume));
  });
  colorStops.push('#3a3a4a');
  return colorStops;
}

function formatPsf(value) {
  if (!value) return '-';
  return `$${Math.round(value).toLocaleString()}`;
}

function formatVolume(value) {
  if (!value) return '-';
  return `${value.toLocaleString()}`;
}

function formatYoY(value) {
  if (value === null || value === undefined) return null;
  const arrow = value >= 0 ? '↑' : '↓';
  const colorClass = value >= 0 ? 'text-emerald-500' : 'text-rose-500';
  return { text: `${arrow}${Math.abs(value).toFixed(1)}%`, colorClass };
}

// =============================================================================
// FILTER OPTIONS
// =============================================================================

const BEDROOM_OPTIONS = [
  { value: 'all', label: 'All', fullLabel: 'All Types' },
  { value: '1', label: '1BR', fullLabel: '1-Bedroom' },
  { value: '2', label: '2BR', fullLabel: '2-Bedroom' },
  { value: '3', label: '3BR', fullLabel: '3-Bedroom' },
  { value: '4+', label: '4BR+', fullLabel: '4+ Bedroom' },
];

const PERIOD_OPTIONS = [
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '1Y' },
  { value: 'all', label: 'All' },
];

// CARTO Dark Matter - deep dark base map
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// =============================================================================
// SMART MARKER COMPONENT - Zoom-Responsive
// =============================================================================

/**
 * DataFlag - Zoom-Responsive Marker Component
 * - Zoom < 12: Simple dot with district ID (e.g., "10")
 * - Zoom >= 12: Full "Data Pill" with price/volume
 */
function DataFlag({ district, data, currentFilter, viewMode, zoom }) {
  const [isHovered, setIsHovered] = useState(false);
  const yoy = data?.yoy_pct !== null ? formatYoY(data.yoy_pct) : null;
  const hasData = data?.has_data;

  // Determine if this is a "hotspot" for special styling
  const isHotspot = viewMode === 'PRICE'
    ? hasData && data?.median_psf >= 2500
    : hasData && data?.tx_count >= 500;

  // Zoom-based display mode
  const isCompactMode = zoom < 12;

  // Display value based on mode and zoom level
  const displayValue = isCompactMode
    ? district.district.replace('D0', '').replace('D', '') // "09" → "9", "19" → "19"
    : viewMode === 'PRICE'
      ? formatPsf(data?.median_psf)
      : `${formatVolume(data?.tx_count)}`;

  return (
    <div
      className="relative cursor-pointer select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Pill - Size adapts to zoom level */}
      <motion.div
        animate={{
          scale: isHovered ? 1.15 : 1,
          y: isHovered ? -3 : 0,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className={`
          ${isCompactMode
            ? 'w-5 h-5 text-[8px] flex items-center justify-center'
            : 'px-2 py-0.5 text-[10px]'
          }
          rounded-full font-bold shadow-lg border-2
          transition-all duration-200 whitespace-nowrap
          ${hasData
            ? isHotspot
              ? viewMode === 'PRICE'
                ? 'bg-[#213448] text-white border-[#94B4C1]/60 shadow-[#213448]/50'
                : 'bg-[#B91C1C] text-white border-red-300/60 shadow-red-900/50'
              : 'bg-white/95 text-slate-900 border-white/80 shadow-black/30'
            : 'bg-slate-700/90 text-slate-400 border-slate-500/50 shadow-black/20'
          }
          ${isHovered ? 'shadow-xl ring-2 ring-white/30' : ''}
        `}
        style={{
          backdropFilter: 'blur(4px)',
        }}
      >
        {hasData ? displayValue : '-'}
      </motion.div>

      {/* Hover Tooltip */}
      <AnimatePresence>
        {isHovered && hasData && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50"
          >
            <div className="bg-white rounded-xl p-3 min-w-[180px] border border-slate-200 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-900 text-sm">
                  {district.district}
                </span>
                <span
                  className={`
                    text-[9px] px-1.5 py-0.5 rounded-full font-semibold
                    ${district.region === 'CCR'
                      ? 'bg-[#213448] text-white'
                      : district.region === 'RCR'
                      ? 'bg-[#547792] text-white'
                      : 'bg-[#94B4C1] text-[#213448]'
                    }
                  `}
                >
                  {district.region}
                </span>
              </div>

              <p className="text-[11px] text-slate-500 mb-2 leading-tight">
                {district.name}
              </p>

              <div className="h-px bg-slate-100 mb-2" />

              {/* Stats */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-500">Median PSF</span>
                  <span className="font-bold text-slate-900 text-xs">
                    {formatPsf(data.median_psf)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-500">Transactions</span>
                  <span className="font-semibold text-slate-700 text-xs">
                    {data.tx_count?.toLocaleString() || 0}
                  </span>
                </div>
                {yoy && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-slate-500">YoY</span>
                    <span className={`font-bold text-xs ${yoy.colorClass}`}>
                      {yoy.text}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2 pt-1.5 border-t border-slate-100">
                <p className="text-[9px] text-slate-400 uppercase tracking-wider text-center">
                  {currentFilter}
                </p>
              </div>

              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function MarketStrategyMap() {
  const [districtData, setDistrictData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBed, setSelectedBed] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('12m');
  const [viewMode, setViewMode] = useState('PRICE'); // 'PRICE' or 'VOLUME'
  const mapRef = useRef(null);

  // Hard-coded initial view - shifted north to clear bottom UI
  const [viewState, setViewState] = useState({
    longitude: MAP_CONFIG.adjustedCenter.longitude,
    latitude: MAP_CONFIG.adjustedCenter.latitude,
    zoom: MAP_CONFIG.defaultZoom,
    pitch: 0,
    bearing: 0,
  });

  // Fetch district PSF data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/insights/district-psf', {
        params: {
          period: selectedPeriod,
          bed: selectedBed,
        },
      });
      setDistrictData(response.data.districts || []);
    } catch (err) {
      console.error('Failed to fetch district PSF data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedBed, selectedPeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Create district lookup map
  const districtMap = useMemo(() => {
    const map = {};
    districtData.forEach((d) => {
      map[d.district_id] = d;
    });
    return map;
  }, [districtData]);

  // Calculate max volume for color scaling
  const maxVolume = useMemo(() => {
    const volumes = districtData.filter((d) => d.tx_count).map((d) => d.tx_count);
    return volumes.length > 0 ? Math.max(...volumes) : 1;
  }, [districtData]);

  // Calculate visual centroids with manual offsets for crowded areas
  const districtCentroids = useMemo(() => {
    return singaporeDistrictsGeoJSON.features.map((feature) => {
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
    }).filter((d) => d.centroid !== null);
  }, []);

  // Fill layer - flat 2D, color-coded by active metric
  const fillLayer = useMemo(
    () => ({
      id: 'district-fill',
      type: 'fill',
      paint: {
        'fill-color': viewMode === 'PRICE'
          ? getPriceColorExpression(districtData)
          : getVolumeColorExpression(districtData, maxVolume),
        'fill-opacity': 1,
      },
    }),
    [districtData, viewMode, maxVolume]
  );

  // "Blueprint" boundary lines - MUST render AFTER fill layer for visibility
  // Using pure white with explicit opacity for maximum contrast
  const lineLayer = useMemo(
    () => ({
      id: 'district-line',
      type: 'line',
      paint: {
        'line-color': '#FFFFFF',      // Pure White
        'line-width': 1.5,            // Thick enough to see
        'line-opacity': 0.5,          // Semi-transparent
        'line-dasharray': [2, 1],     // Tight Blueprint Dash
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    }),
    []
  );

  // Handle map load - no fitBounds needed, using hard-coded center
  const handleMapLoad = useCallback(() => {
    // Map is already positioned correctly via initialViewState
    // No fitBounds auto-calculation needed - it's unreliable across screen sizes
  }, []);

  // Calculate stats ranges
  const psfRange = useMemo(() => {
    const validPsfs = districtData
      .filter((d) => d.median_psf)
      .map((d) => d.median_psf);
    if (validPsfs.length === 0) return { min: 0, max: 0 };
    return {
      min: Math.min(...validPsfs),
      max: Math.max(...validPsfs),
    };
  }, [districtData]);

  const volumeRange = useMemo(() => {
    const validVolumes = districtData
      .filter((d) => d.tx_count)
      .map((d) => d.tx_count);
    if (validVolumes.length === 0) return { min: 0, max: 0, total: 0 };
    return {
      min: Math.min(...validVolumes),
      max: Math.max(...validVolumes),
      total: validVolumes.reduce((a, b) => a + b, 0),
    };
  }, [districtData]);

  const currentBedroomLabel =
    BEDROOM_OPTIONS.find((o) => o.value === selectedBed)?.fullLabel || 'All Types';

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-700 bg-slate-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white">
              District {viewMode === 'PRICE' ? 'PSF' : 'Activity'} Overview
            </h2>
            <p className="text-xs md:text-sm text-slate-400 mt-0.5">
              {viewMode === 'PRICE'
                ? 'Median price per sqft by postal district'
                : 'Transaction volume hotspots by district'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 p-1 bg-slate-700 rounded-lg">
              <button
                onClick={() => setViewMode('PRICE')}
                className={`
                  px-2.5 py-1 text-xs font-semibold rounded-md transition-all
                  ${viewMode === 'PRICE'
                    ? 'bg-[#547792] text-white shadow'
                    : 'text-slate-300 hover:text-white'
                  }
                `}
              >
                💲 Price
              </button>
              <button
                onClick={() => setViewMode('VOLUME')}
                className={`
                  px-2.5 py-1 text-xs font-semibold rounded-md transition-all
                  ${viewMode === 'VOLUME'
                    ? 'bg-orange-500 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                  }
                `}
              >
                🔥 Volume
              </button>
            </div>

            {/* Period Filter */}
            <div className="flex items-center gap-1">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedPeriod(option.value)}
                  className={`
                    px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all
                    ${selectedPeriod === option.value
                      ? 'bg-[#547792] text-white shadow-lg'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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

      {/* Map Container */}
      <div className="relative" style={{ height: '520px' }}>
        {/* Loading Overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/95 z-30 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-[#547792] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-400 font-medium">Loading map...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-30">
            <div className="text-center">
              <p className="text-slate-400">{error}</p>
              <button
                onClick={fetchData}
                className="mt-3 px-4 py-2 bg-[#547792] text-white text-sm font-medium rounded-lg hover:bg-[#6389a3] transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* MapLibre GL Map - Bounded Exploration "Playpen" */}
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          onLoad={handleMapLoad}
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
        >
          {/* District polygons - fill first, then line on top */}
          <Source id="districts" type="geojson" data={singaporeDistrictsGeoJSON}>
            {/* CRITICAL: Layer order matters! Fill first (bottom), Line second (top) */}
            <Layer {...fillLayer} />
            <Layer {...lineLayer} />
          </Source>

          {/* Smart Markers - zoom-responsive */}
          {!loading && districtCentroids.map((district) => {
            const data = districtMap[district.district];
            return (
              <Marker
                key={district.district}
                longitude={district.centroid.lng}
                latitude={district.centroid.lat}
                anchor="center"
              >
                <DataFlag
                  district={district}
                  data={data}
                  currentFilter={currentBedroomLabel}
                  viewMode={viewMode}
                  zoom={viewState.zoom}
                />
              </Marker>
            );
          })}
        </Map>

        {/* Living Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
        >
          <div className="flex items-center gap-1 p-1 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-xl shadow-2xl">
            {BEDROOM_OPTIONS.map((option) => (
              <motion.button
                key={option.value}
                onClick={() => setSelectedBed(option.value)}
                whileTap={{ scale: 0.95 }}
                className={`
                  px-3 py-1.5 text-xs font-semibold rounded-lg transition-all
                  ${selectedBed === option.value
                    ? 'bg-[#547792] text-white shadow-lg'
                    : 'bg-transparent text-slate-300 hover:bg-slate-700'
                  }
                `}
              >
                {option.label}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Legend - CCR/RCR/OCR Tiers */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="absolute top-4 right-4 z-20"
        >
          <div className="p-3 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-xl shadow-xl">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2.5">
              {viewMode === 'PRICE' ? 'Market Segments' : 'Activity Level'}
            </p>
            <div className="space-y-2">
              {viewMode === 'PRICE' ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.deepNavy }} />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-white font-semibold">CCR</span>
                      <span className="text-[9px] text-slate-400">&gt; $2,200 psf</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.oceanBlue }} />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-white font-semibold">RCR</span>
                      <span className="text-[9px] text-slate-400">$1,400 - $2,199</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.skyBlue }} />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-white font-semibold">OCR</span>
                      <span className="text-[9px] text-slate-400">&lt; $1,400 psf</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: VOLUME_COLORS.high }} />
                    <span className="text-[10px] text-white">High activity</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: VOLUME_COLORS.medium }} />
                    <span className="text-[10px] text-white">Medium</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: VOLUME_COLORS.low }} />
                    <span className="text-[10px] text-white">Low activity</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Instructions */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute top-4 left-4 z-20"
        >
          <div className="px-2.5 py-1.5 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-lg shadow-xl">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">
              Drag to explore &bull; Scroll to zoom &bull; Hover for details
            </p>
          </div>
        </motion.div>
      </div>

      {/* Stats Summary Footer */}
      {!loading && !error && districtData.length > 0 && (
        <div className="px-4 py-3 md:px-6 bg-slate-800 border-t border-slate-700">
          <div className="grid grid-cols-3 gap-4 text-center">
            {viewMode === 'PRICE' ? (
              <>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Lowest PSF
                  </p>
                  <p className="text-sm md:text-base font-bold text-white">
                    {formatPsf(psfRange.min)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Districts
                  </p>
                  <p className="text-sm md:text-base font-bold text-white">
                    {districtData.filter((d) => d.has_data).length} / 28
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Highest PSF
                  </p>
                  <p className="text-sm md:text-base font-bold text-white">
                    {formatPsf(psfRange.max)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Total Tx
                  </p>
                  <p className="text-sm md:text-base font-bold text-white">
                    {volumeRange.total.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Busiest
                  </p>
                  <p className="text-sm md:text-base font-bold text-orange-400">
                    {volumeRange.max.toLocaleString()} tx
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Quietest
                  </p>
                  <p className="text-sm md:text-base font-bold text-white">
                    {volumeRange.min.toLocaleString()} tx
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Global Styles */}
      <style>{`
        .maplibregl-ctrl-attrib {
          display: none !important;
        }
        /* Deep void background - Singapore "pops" like a stage spotlight */
        .maplibregl-map {
          background-color: ${COLORS.void} !important;
        }
      `}</style>
    </div>
  );
}
