/**
 * MarketStrategyMap - "Command Center" View for Singapore Property Market
 *
 * A strategy board showing district PSF values at a glance.
 * Features:
 * - Draggable map with bounds constrained to Singapore only
 * - Price/Volume view mode toggle for different insights
 * - Real interlocking polygons (jigsaw-style, no overlap)
 * - High-contrast "Data Flag" markers as the hero element
 * - Polylabel algorithm ensures markers stay inside polygons
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../api/client';
import { singaporeDistrictsGeoJSON, SINGAPORE_CENTER } from '../../data/singaporeDistrictsGeoJSON';

// Theme colors (Warm Precision palette)
const COLORS = {
  deepNavy: '#213448',
  oceanBlue: '#547792',
  skyBlue: '#94B4C1',
  sand: '#EAE0CF',
};

// Volume "Hot" gradient colors
const VOLUME_COLORS = {
  low: '#FDE68A',      // Pale Yellow
  medium: '#F59E0B',   // Orange
  high: '#B91C1C',     // Red
};

// Singapore bounds - tight constraint to prevent showing Malaysia
const SINGAPORE_BOUNDS = [
  [103.59, 1.17],  // Southwest
  [104.05, 1.48],  // Northeast
];

// Padding for fitBounds - heavy bottom to clear UI "chin"
const MAP_PADDING = {
  top: 60,
  bottom: 200,  // Generous space for filter bar
  left: 60,
  right: 60,
};

// Manual marker offsets for crowded central districts (D09, D10, D11)
const MARKER_OFFSETS = {
  'D09': { lng: -0.008, lat: 0.006 },
  'D10': { lng: 0.008, lat: 0.003 },
  'D11': { lng: 0.005, lat: -0.006 },
  'D01': { lng: -0.003, lat: 0.004 },
  'D02': { lng: 0.004, lat: -0.003 },
};

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

  if (cellSize === 0) {
    return { lng: minX, lat: minY };
  }

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

  if (lengthSq === 0) {
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;

  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
}

// Get fill color based on PSF value (Price Mode)
function getPsfColor(psf, hasData) {
  if (!hasData || !psf) return '#3a3a4a';
  if (psf < 1400) return COLORS.skyBlue;
  if (psf < 2200) return COLORS.oceanBlue;
  return COLORS.deepNavy;
}

// Get fill color based on transaction volume (Volume Mode)
function getVolumeColor(txCount, hasData, maxVolume) {
  if (!hasData || !txCount) return '#3a3a4a';
  const ratio = txCount / maxVolume;
  if (ratio < 0.33) return VOLUME_COLORS.low;
  if (ratio < 0.66) return VOLUME_COLORS.medium;
  return VOLUME_COLORS.high;
}

// Build color expression for Price mode
function getPriceColorExpression(districtData) {
  const colorStops = ['case'];
  districtData.forEach((d) => {
    colorStops.push(['==', ['get', 'district'], d.district_id]);
    colorStops.push(getPsfColor(d.median_psf, d.has_data));
  });
  colorStops.push('#3a3a4a');
  return colorStops;
}

// Build color expression for Volume mode
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

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/**
 * DataFlag - Compact Marker Component
 * Shows PSF or Volume based on view mode
 */
function DataFlag({ district, data, currentFilter, viewMode }) {
  const [isHovered, setIsHovered] = useState(false);
  const yoy = data?.yoy_pct !== null ? formatYoY(data.yoy_pct) : null;
  const hasData = data?.has_data;

  // Determine styling based on view mode
  const isHotspot = viewMode === 'PRICE'
    ? hasData && data?.median_psf >= 2500
    : hasData && data?.tx_count >= 500;

  // Display value based on mode
  const displayValue = viewMode === 'PRICE'
    ? formatPsf(data?.median_psf)
    : `${formatVolume(data?.tx_count)} tx`;

  return (
    <div
      className="relative cursor-pointer select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Pill - Compact size to reduce collision */}
      <motion.div
        animate={{
          scale: isHovered ? 1.1 : 1,
          y: isHovered ? -2 : 0,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className={`
          px-1.5 py-0.5 rounded-full
          font-bold text-[10px]
          shadow-md border
          transition-shadow duration-200
          whitespace-nowrap
          ${hasData
            ? isHotspot
              ? viewMode === 'PRICE'
                ? 'bg-[#213448] text-white border-[#94B4C1]/50 shadow-[#213448]/40'
                : 'bg-[#B91C1C] text-white border-red-300/50 shadow-red-900/40'
              : 'bg-white text-slate-900 border-slate-200 shadow-black/20'
            : 'bg-slate-700/80 text-slate-400 border-slate-600/50 shadow-black/10'
          }
          ${isHovered ? 'shadow-lg' : ''}
        `}
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
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-50"
          >
            <div className="bg-white rounded-xl p-3 min-w-[175px] border border-slate-200 shadow-2xl">
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

export default function MarketStrategyMap() {
  const [districtData, setDistrictData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBed, setSelectedBed] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('12m');
  const [viewMode, setViewMode] = useState('PRICE'); // 'PRICE' or 'VOLUME'
  const mapRef = useRef(null);

  const [viewState, setViewState] = useState({
    longitude: SINGAPORE_CENTER.lng,
    latitude: SINGAPORE_CENTER.lat,
    zoom: 10.5,
    pitch: 0,
    bearing: 0,
  });

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

  // Fill layer - switches between Price and Volume gradients
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

  // Crisp white boundary lines - "Technical Grid" style
  const lineLayer = useMemo(
    () => ({
      id: 'district-line',
      type: 'line',
      paint: {
        'line-color': 'rgba(255, 255, 255, 0.5)',
        'line-width': 2,
        'line-dasharray': [2, 3], // Tight, technical dotted line
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    }),
    []
  );

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      map.fitBounds(SINGAPORE_BOUNDS, {
        padding: MAP_PADDING,
        duration: 0,
      });
    }
  }, []);

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
                $ Price
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

        {/* MapLibre GL Map */}
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
          maxBounds={SINGAPORE_BOUNDS}
          minZoom={9.5}
          maxZoom={13}
          maxPitch={0}
        >
          {/* District polygons */}
          <Source id="districts" type="geojson" data={singaporeDistrictsGeoJSON}>
            <Layer {...fillLayer} />
            <Layer {...lineLayer} />
          </Source>

          {/* Data Flag Markers */}
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
                />
              </Marker>
            );
          })}
        </Map>

        {/* Slim Filter Bar - No label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
        >
          <div className="flex items-center gap-1 p-1 bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-xl shadow-2xl">
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

        {/* Legend - Dynamic based on view mode */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="absolute top-4 right-4 z-20"
        >
          <div className="p-2.5 bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-xl shadow-xl">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
              {viewMode === 'PRICE' ? 'Price Tier' : 'Activity Level'}
            </p>
            <div className="space-y-1.5">
              {viewMode === 'PRICE' ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.deepNavy }} />
                    <span className="text-[10px] text-white">$2,200+ psf</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.oceanBlue }} />
                    <span className="text-[10px] text-white">$1,400-2,199</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.skyBlue }} />
                    <span className="text-[10px] text-white">&lt; $1,400</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: VOLUME_COLORS.high }} />
                    <span className="text-[10px] text-white">High activity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: VOLUME_COLORS.medium }} />
                    <span className="text-[10px] text-white">Medium</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: VOLUME_COLORS.low }} />
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
          <div className="px-2.5 py-1.5 bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-lg shadow-xl">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">
              Drag &bull; Scroll &bull; Hover
            </p>
          </div>
        </motion.div>
      </div>

      {/* Stats Summary - Dynamic based on view mode */}
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

      <style>{`
        .maplibregl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
