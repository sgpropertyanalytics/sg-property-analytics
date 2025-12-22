/**
 * MarketStrategyMap - "Command Center" View for Singapore Property Market
 *
 * A fixed-viewport strategy board showing district PSF values at a glance.
 * Features:
 * - Locked panning (dragPan=false), zoom only for inspection
 * - 2D flat polygons with color gradient (Sky Blue → Deep Navy)
 * - "Data Flag" markers at district centroids showing PSF values
 * - Hover tooltips with transactions and YoY trends
 * - Dark mode base map for contrast
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
  [103.6, 1.15],  // Southwest
  [104.1, 1.47],  // Northeast
];

// Calculate centroid of a polygon
function calculateCentroid(coordinates) {
  // Handle nested polygon structure (first array is outer ring)
  const ring = coordinates[0];
  if (!ring || ring.length === 0) return null;

  let sumLng = 0;
  let sumLat = 0;
  const n = ring.length - 1; // Exclude closing point (same as first)

  for (let i = 0; i < n; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }

  return {
    lng: sumLng / n,
    lat: sumLat / n,
  };
}

// Get fill color based on PSF value
function getPsfColor(psf) {
  if (!psf) return 'rgba(80, 80, 100, 0.3)'; // Ghost
  if (psf < 1400) return COLORS.skyBlue;
  if (psf < 2200) return COLORS.oceanBlue;
  return COLORS.deepNavy;
}

// Get marker background based on region
function getMarkerStyle(region, hasData) {
  if (!hasData) {
    return {
      bg: 'bg-gray-600/60',
      border: 'border-gray-500/50',
      text: 'text-gray-400',
    };
  }
  switch (region) {
    case 'CCR':
      return {
        bg: 'bg-[#213448]/95',
        border: 'border-[#94B4C1]/60',
        text: 'text-white',
      };
    case 'RCR':
      return {
        bg: 'bg-[#547792]/95',
        border: 'border-[#EAE0CF]/60',
        text: 'text-white',
      };
    default: // OCR
      return {
        bg: 'bg-[#EAE0CF]/95',
        border: 'border-[#547792]/60',
        text: 'text-[#213448]',
      };
  }
}

// Build color expression for flat fill
function getColorExpression(districtData) {
  const colorStops = ['case'];

  districtData.forEach((d) => {
    colorStops.push(['==', ['get', 'district'], d.district_id]);
    colorStops.push(getPsfColor(d.has_data ? d.median_psf : null));
  });

  colorStops.push('rgba(80, 80, 100, 0.3)');
  return colorStops;
}

// Build opacity expression
function getOpacityExpression(districtData) {
  const opacityStops = ['case'];

  districtData.forEach((d) => {
    opacityStops.push(['==', ['get', 'district'], d.district_id]);
    opacityStops.push(d.has_data ? 0.7 : 0.2);
  });

  opacityStops.push(0.2);
  return opacityStops;
}

// Format currency
function formatPsf(value) {
  if (!value) return '-';
  return `$${Math.round(value).toLocaleString()}`;
}

// Format compact PSF for marker
function formatPsfCompact(value) {
  if (!value) return '-';
  const rounded = Math.round(value);
  if (rounded >= 1000) {
    return `$${(rounded / 1000).toFixed(1)}k`;
  }
  return `$${rounded}`;
}

// Format percentage with arrow
function formatYoY(value) {
  if (value === null || value === undefined) return null;
  const arrow = value >= 0 ? '↑' : '↓';
  const colorClass = value >= 0 ? 'text-emerald-400' : 'text-rose-400';
  return { text: `${arrow} ${Math.abs(value).toFixed(1)}%`, colorClass };
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
 * DataFlag Marker Component
 * Displays PSF value at district centroid with hover tooltip
 */
function DataFlag({ district, data, currentFilter }) {
  const [isHovered, setIsHovered] = useState(false);
  const style = getMarkerStyle(district.region, data?.has_data);
  const yoy = data?.yoy_pct !== null ? formatYoY(data.yoy_pct) : null;

  return (
    <div
      className="relative cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Flag/Pill */}
      <motion.div
        animate={{
          scale: isHovered ? 1.15 : 1,
          y: isHovered ? -4 : 0,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={`
          px-2 py-1 rounded-lg
          ${style.bg} ${style.border} border
          shadow-lg backdrop-blur-sm
          whitespace-nowrap
          transition-shadow duration-200
          ${isHovered ? 'shadow-xl shadow-black/40' : 'shadow-md shadow-black/20'}
        `}
      >
        <span className={`text-xs font-bold ${style.text} font-mono`}>
          {data?.has_data ? formatPsfCompact(data.median_psf) : '-'}
        </span>
      </motion.div>

      {/* Hover Tooltip */}
      <AnimatePresence>
        {isHovered && data?.has_data && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50"
          >
            <div className="bg-[#16162a]/95 backdrop-blur-md rounded-lg p-3 min-w-[180px] border border-[#94B4C1]/40 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-white text-sm">
                  {district.district}
                </span>
                <span
                  className={`
                    text-[10px] px-1.5 py-0.5 rounded font-medium
                    ${
                      district.region === 'CCR'
                        ? 'bg-[#213448] text-[#94B4C1]'
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
              <p className="text-[11px] text-[#94B4C1] mb-2 line-clamp-1">
                {district.name}
              </p>

              {/* Filter Label */}
              <p className="text-[9px] text-[#547792] mb-2 uppercase tracking-wider">
                {currentFilter}
              </p>

              {/* Stats */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#94B4C1]">Median PSF</span>
                  <span className="font-bold text-white font-mono">
                    {formatPsf(data.median_psf)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#94B4C1]">Transactions</span>
                  <span className="font-medium text-white font-mono">
                    {data.tx_count?.toLocaleString() || 0} sold
                  </span>
                </div>
                {yoy && (
                  <div className="flex justify-between text-xs">
                    <span className="text-[#94B4C1]">YoY Change</span>
                    <span className={`font-medium font-mono ${yoy.colorClass}`}>
                      {yoy.text}
                    </span>
                  </div>
                )}
              </div>

              {/* Tooltip Arrow */}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#16162a]/95 border-r border-b border-[#94B4C1]/40 rotate-45" />
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

  // Calculate centroids for each district
  const districtCentroids = useMemo(() => {
    return singaporeDistrictsGeoJSON.features.map((feature) => {
      const centroid = calculateCentroid(feature.geometry.coordinates);
      return {
        district: feature.properties.district,
        name: feature.properties.name,
        region: feature.properties.region,
        centroid,
      };
    }).filter((d) => d.centroid !== null);
  }, []);

  // Flat fill layer for district polygons
  const fillLayer = useMemo(
    () => ({
      id: 'district-fill',
      type: 'fill',
      paint: {
        'fill-color': getColorExpression(districtData),
        'fill-opacity': getOpacityExpression(districtData),
        'fill-opacity-transition': { duration: 300 },
      },
    }),
    [districtData]
  );

  // Grout line layer for borders
  const lineLayer = useMemo(
    () => ({
      id: 'district-line',
      type: 'line',
      paint: {
        'line-color': COLORS.sand,
        'line-width': 1.5,
        'line-opacity': 0.6,
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
    <div className="bg-[#1a1a2e] rounded-xl border border-[#94B4C1]/20 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 md:px-6 md:py-4 border-b border-[#94B4C1]/20 bg-[#16162a]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-white">
              District PSF Overview
            </h2>
            <p className="text-xs md:text-sm text-[#94B4C1] mt-0.5">
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
                  px-2.5 py-1 text-xs font-medium rounded-md
                  transition-all duration-150
                  ${
                    selectedPeriod === option.value
                      ? 'bg-[#547792] text-white'
                      : 'bg-white/10 text-[#94B4C1] hover:bg-white/20'
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
      <div className="relative" style={{ height: '500px' }}>
        {/* Loading Overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#1a1a2e]/90 z-30 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[#94B4C1]">Loading map data...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e] z-30">
            <div className="text-center">
              <p className="text-[#94B4C1]">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-sm text-[#547792] hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* MapLibre GL Map - Fixed Viewport (no pan, zoom only) */}
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
          {/* District polygons - flat 2D fill */}
          <Source id="districts" type="geojson" data={singaporeDistrictsGeoJSON}>
            <Layer {...fillLayer} />
            <Layer {...lineLayer} />
          </Source>

          {/* Data Flag Markers at centroids */}
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

        {/* Glass-morphic Filter Bar (Floating) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
        >
          <div
            className="
              flex items-center gap-1 md:gap-2 p-1.5
              bg-white/10 backdrop-blur-lg
              border border-white/20
              rounded-xl shadow-2xl
            "
          >
            <span className="text-xs text-white/70 px-2 hidden sm:inline">
              Unit Type:
            </span>
            {BEDROOM_OPTIONS.map((option) => (
              <motion.button
                key={option.value}
                onClick={() => setSelectedBed(option.value)}
                whileTap={{ scale: 0.95 }}
                className={`
                  min-h-[36px] md:min-h-[40px]
                  px-3 md:px-4 py-1.5 md:py-2
                  text-xs md:text-sm font-medium
                  rounded-lg
                  transition-all duration-200
                  ${
                    selectedBed === option.value
                      ? 'bg-[#547792] text-white shadow-lg shadow-[#547792]/30'
                      : 'bg-transparent text-white/80 hover:bg-white/10'
                  }
                `}
              >
                {option.label}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Legend (Floating) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="absolute top-4 right-4 z-20"
        >
          <div
            className="
              p-3 bg-[#16162a]/90 backdrop-blur-md
              border border-[#94B4C1]/30
              rounded-lg shadow-xl
            "
          >
            <p className="text-[10px] text-[#94B4C1] uppercase tracking-wider mb-2">
              Region / PSF Tier
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: COLORS.skyBlue }}
                />
                <span className="text-xs text-white/80">OCR / &lt; $1,400</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: COLORS.oceanBlue }}
                />
                <span className="text-xs text-white/80">RCR / $1,400-$2,200</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: COLORS.deepNavy }}
                />
                <span className="text-xs text-white/80">CCR / &gt; $2,200</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <div className="w-4 h-4 rounded bg-gray-500/30" />
                <span className="text-xs text-white/50">No data</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Instructions (Floating) */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute top-4 left-4 z-20"
        >
          <div
            className="
              px-3 py-2 bg-[#16162a]/90 backdrop-blur-md
              border border-[#94B4C1]/30
              rounded-lg shadow-xl
            "
          >
            <p className="text-[10px] text-[#94B4C1] uppercase tracking-wider">
              Scroll to zoom &bull; Hover flags for details
            </p>
          </div>
        </motion.div>
      </div>

      {/* Stats Summary */}
      {!loading && !error && districtData.length > 0 && (
        <div className="px-4 py-3 md:px-6 md:py-4 bg-[#16162a] border-t border-[#94B4C1]/20">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] text-[#94B4C1] uppercase tracking-wider">
                Lowest PSF
              </p>
              <p className="text-sm md:text-base font-semibold text-white font-mono">
                {formatPsf(psfRange.min)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#94B4C1] uppercase tracking-wider">
                Districts
              </p>
              <p className="text-sm md:text-base font-semibold text-white font-mono">
                {districtData.filter((d) => d.has_data).length} / 28
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#94B4C1] uppercase tracking-wider">
                Highest PSF
              </p>
              <p className="text-sm md:text-base font-semibold text-white font-mono">
                {formatPsf(psfRange.max)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Custom MapLibre styles */}
      <style>{`
        .maplibregl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
