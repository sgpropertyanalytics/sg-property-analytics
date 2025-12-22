/**
 * MarketStrategyMap - "Command Center" View for Singapore Property Market
 *
 * A fixed-viewport strategy board showing district PSF values at a glance.
 * Features:
 * - Locked panning (dragPan=false), zoom only for inspection
 * - Real interlocking polygons (jigsaw-style, no overlap)
 * - Solid fills (100% opacity) with clean 1px borders
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

// Singapore bounds - strict constraint
const SINGAPORE_BOUNDS = [
  [103.60, 1.20],  // Southwest
  [104.05, 1.48],  // Northeast
];

/**
 * Polylabel Algorithm - Find visual center of polygon
 * Finds the point inside a polygon that is farthest from any edge.
 * This ensures markers don't float in the ocean for U-shaped districts.
 */
function polylabel(polygon, precision = 0.001) {
  const ring = polygon[0];
  if (!ring || ring.length < 4) return null;

  // Calculate bounding box
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

  // Use centroid as initial best guess
  let bestX = 0, bestY = 0, bestDist = -Infinity;
  let sumX = 0, sumY = 0, sumArea = 0;

  // Calculate centroid
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

  // Check if centroid is inside polygon
  if (pointInPolygon([bestX, bestY], ring)) {
    return { lng: bestX, lat: bestY };
  }

  // Grid search for better point
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

// Ray casting algorithm to check if point is inside polygon
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

// Calculate minimum distance from point to polygon edges
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

// Distance from point to line segment
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

// Get solid fill color based on PSF value (100% opacity)
function getPsfColor(psf, hasData) {
  if (!hasData || !psf) return '#3a3a4a'; // Ghost - dark gray
  if (psf < 1400) return COLORS.skyBlue;
  if (psf < 2200) return COLORS.oceanBlue;
  return COLORS.deepNavy;
}

// Build color expression for solid fills
function getColorExpression(districtData) {
  const colorStops = ['case'];

  districtData.forEach((d) => {
    colorStops.push(['==', ['get', 'district'], d.district_id]);
    colorStops.push(getPsfColor(d.median_psf, d.has_data));
  });

  colorStops.push('#3a3a4a'); // Default ghost color
  return colorStops;
}

// Format currency
function formatPsf(value) {
  if (!value) return '-';
  return `$${Math.round(value).toLocaleString()}`;
}

// Format percentage with arrow
function formatYoY(value) {
  if (value === null || value === undefined) return null;
  const arrow = value >= 0 ? '↑' : '↓';
  const colorClass = value >= 0 ? 'text-emerald-500' : 'text-rose-500';
  return { text: `${arrow}${Math.abs(value).toFixed(1)}%`, colorClass };
}

// Bedroom filter options
const BEDROOM_OPTIONS = [
  { value: 'all', label: 'All', fullLabel: 'All Types' },
  { value: '1', label: '1BR', fullLabel: '1-Bedroom' },
  { value: '2', label: '2BR', fullLabel: '2-Bedroom' },
  { value: '3', label: '3BR', fullLabel: '3-Bedroom' },
  { value: '4+', label: '4BR+', fullLabel: '4+ Bedroom' },
];

// Period filter options
const PERIOD_OPTIONS = [
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '1Y' },
  { value: 'all', label: 'All' },
];

// Dark Matter map style
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/**
 * DataFlag - High-Contrast Marker Component
 * The "hero" element showing PSF values at a glance
 */
function DataFlag({ district, data, currentFilter }) {
  const [isHovered, setIsHovered] = useState(false);
  const yoy = data?.yoy_pct !== null ? formatYoY(data.yoy_pct) : null;

  // High contrast styling: white bg default, navy for hotspots (>$2.5k)
  const isHotspot = data?.has_data && data?.median_psf >= 2500;
  const hasData = data?.has_data;

  return (
    <div
      className="relative cursor-pointer select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Pill/Flag */}
      <motion.div
        animate={{
          scale: isHovered ? 1.12 : 1,
          y: isHovered ? -3 : 0,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className={`
          px-2.5 py-1 rounded-full
          font-bold text-xs
          shadow-lg
          border
          transition-shadow duration-200
          ${hasData
            ? isHotspot
              ? 'bg-[#213448] text-white border-[#94B4C1]/50 shadow-[#213448]/40'
              : 'bg-white text-slate-900 border-slate-200 shadow-black/20'
            : 'bg-slate-700/80 text-slate-400 border-slate-600/50 shadow-black/10'
          }
          ${isHovered ? 'shadow-xl' : ''}
        `}
      >
        {hasData ? formatPsf(data.median_psf) : '-'}
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
            <div className="bg-white rounded-xl p-3.5 min-w-[190px] border border-slate-200 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 text-sm">
                  {district.district}
                </span>
                <span
                  className={`
                    text-[10px] px-2 py-0.5 rounded-full font-semibold
                    ${
                      district.region === 'CCR'
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

              {/* District Name */}
              <p className="text-xs text-slate-500 mb-2.5 leading-tight">
                {district.name}
              </p>

              {/* Divider */}
              <div className="h-px bg-slate-100 mb-2.5" />

              {/* Stats */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Median PSF</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {formatPsf(data.median_psf)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Transactions</span>
                  <span className="font-semibold text-slate-700 text-sm">
                    {data.tx_count?.toLocaleString() || 0} sold
                  </span>
                </div>
                {yoy && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">YoY Change</span>
                    <span className={`font-bold text-sm ${yoy.colorClass}`}>
                      {yoy.text}
                    </span>
                  </div>
                )}
              </div>

              {/* Filter Label */}
              <div className="mt-2.5 pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider text-center">
                  {currentFilter}
                </p>
              </div>

              {/* Tooltip Arrow */}
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
  const mapRef = useRef(null);

  // Initial view state - centered on Singapore
  const [viewState, setViewState] = useState({
    longitude: SINGAPORE_CENTER.lng,
    latitude: SINGAPORE_CENTER.lat,
    zoom: 10.5,
    pitch: 0, // Flat 2D view
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

  // Calculate visual centroids using polylabel algorithm
  const districtCentroids = useMemo(() => {
    return singaporeDistrictsGeoJSON.features.map((feature) => {
      const centroid = polylabel(feature.geometry.coordinates);
      return {
        district: feature.properties.district,
        name: feature.properties.name,
        region: feature.properties.region,
        centroid,
      };
    }).filter((d) => d.centroid !== null);
  }, []);

  // Solid fill layer (100% opacity)
  const fillLayer = useMemo(
    () => ({
      id: 'district-fill',
      type: 'fill',
      paint: {
        'fill-color': getColorExpression(districtData),
        'fill-opacity': 1, // Solid fill - no transparency
      },
    }),
    [districtData]
  );

  // Clean border line layer
  const lineLayer = useMemo(
    () => ({
      id: 'district-line',
      type: 'line',
      paint: {
        'line-color': COLORS.skyBlue,
        'line-width': 1,
        'line-opacity': 0.8,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    }),
    []
  );

  // Calculate PSF range for stats
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

  // Get current bedroom label
  const currentBedroomLabel =
    BEDROOM_OPTIONS.find((o) => o.value === selectedBed)?.fullLabel || 'All Types';

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-700 bg-slate-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white">
              District PSF Overview
            </h2>
            <p className="text-xs md:text-sm text-slate-400 mt-0.5">
              Median price per sqft by postal district
            </p>
          </div>

          {/* Period Filter */}
          <div className="flex items-center gap-1.5">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedPeriod(option.value)}
                className={`
                  px-3 py-1.5 text-xs font-semibold rounded-lg
                  transition-all duration-150
                  ${
                    selectedPeriod === option.value
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

        {/* MapLibre GL Map - Fixed Viewport */}
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapStyle={MAP_STYLE}
          style={{ width: '100%', height: '100%' }}
          dragPan={false}
          dragRotate={false}
          touchZoomRotate={true}
          scrollZoom={true}
          doubleClickZoom={true}
          keyboard={false}
          maxBounds={SINGAPORE_BOUNDS}
          minZoom={10}
          maxZoom={13}
          maxPitch={0}
        >
          {/* District polygons - solid 2D fill */}
          <Source id="districts" type="geojson" data={singaporeDistrictsGeoJSON}>
            <Layer {...fillLayer} />
            <Layer {...lineLayer} />
          </Source>

          {/* Data Flag Markers at visual centroids */}
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
                />
              </Marker>
            );
          })}
        </Map>

        {/* Glass-morphic Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
        >
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-xl shadow-2xl">
            <span className="text-xs text-slate-400 px-2 hidden sm:inline font-medium">
              Unit Type:
            </span>
            {BEDROOM_OPTIONS.map((option) => (
              <motion.button
                key={option.value}
                onClick={() => setSelectedBed(option.value)}
                whileTap={{ scale: 0.95 }}
                className={`
                  min-h-[38px] px-3.5 py-2
                  text-xs font-semibold
                  rounded-lg
                  transition-all duration-200
                  ${
                    selectedBed === option.value
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

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="absolute top-4 right-4 z-20"
        >
          <div className="p-3 bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-xl shadow-xl">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
              PSF Legend
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.skyBlue }} />
                <span className="text-xs text-slate-300">&lt; $1,400</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.oceanBlue }} />
                <span className="text-xs text-slate-300">$1,400 - $2,200</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.deepNavy }} />
                <span className="text-xs text-slate-300">&gt; $2,200</span>
              </div>
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
          <div className="px-3 py-2 bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-xl shadow-xl">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
              Scroll to zoom &bull; Hover for details
            </p>
          </div>
        </motion.div>
      </div>

      {/* Stats Summary */}
      {!loading && !error && districtData.length > 0 && (
        <div className="px-4 py-4 md:px-6 bg-slate-800 border-t border-slate-700">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Lowest PSF
              </p>
              <p className="text-base md:text-lg font-bold text-white mt-0.5">
                {formatPsf(psfRange.min)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Districts
              </p>
              <p className="text-base md:text-lg font-bold text-white mt-0.5">
                {districtData.filter((d) => d.has_data).length} / 28
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Highest PSF
              </p>
              <p className="text-base md:text-lg font-bold text-white mt-0.5">
                {formatPsf(psfRange.max)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hide MapLibre attribution */}
      <style>{`
        .maplibregl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
