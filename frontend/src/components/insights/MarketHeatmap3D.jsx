/**
 * MarketHeatmap3D - 3D Visual Analytics Map for Singapore Property Market
 *
 * MapLibre GL-based 3D visualization showing Median PSF across 28 districts.
 * Features:
 * - "Floating Plateau" style - subtle raised tiles with clear separation
 * - Grout lines between districts for visual definition
 * - Hover lift effect (+20% height) with brightness increase
 * - Dark "Dark Matter" base map style
 * - "Living Filters" bedroom toggle with glass-morphic styling
 * - Strict Singapore bounds and pitch limits
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../api/client';
import { singaporeDistrictsGeoJSON, SINGAPORE_CENTER } from '../../data/singaporeDistrictsGeoJSON';
import { useStaleRequestGuard } from '../../hooks';
import { getRegionBadgeClass, BEDROOM_FILTER_OPTIONS, PERIOD_FILTER_OPTIONS } from '../../constants';

// Theme colors (Warm Precision palette)
const COLORS = {
  deepNavy: '#213448',
  oceanBlue: '#547792',
  skyBlue: '#94B4C1',
  sand: '#EAE0CF',
};

// Height settings for "Floating Plateau" effect
// Subtle heights so districts don't obscure each other
const HEIGHT_MULTIPLIER = 0.15; // Drastically reduced from 3
const BASE_HEIGHT = 50;
const MIN_HEIGHT = 20; // Ghost districts
const HOVER_LIFT_FACTOR = 1.2; // 20% lift on hover

// Singapore bounds - strict constraint
const SINGAPORE_BOUNDS = [
  [103.6, 1.15], // Southwest
  [104.1, 1.47], // Northeast
];

// Get color based on PSF value using the specified thresholds
function getPsfColor(psf) {
  if (!psf) return 'rgba(100, 100, 120, 0.25)'; // Ghost mode - slightly visible
  if (psf < 1400) return COLORS.skyBlue;
  if (psf < 2200) return COLORS.oceanBlue;
  return COLORS.deepNavy;
}

// Get brightened color for hover state
function getPsfColorBright(psf) {
  if (!psf) return 'rgba(120, 120, 140, 0.35)';
  if (psf < 1400) return '#a8c4cf'; // Lighter Sky Blue
  if (psf < 2200) return '#6a8da8'; // Lighter Ocean Blue
  return '#2d4a60'; // Lighter Deep Navy
}

// Build color expression with hover state support
function getColorExpression(districtData) {
  const colorStops = ['case'];

  // For each district, check hover state first
  districtData.forEach((d) => {
    const normalColor = getPsfColor(d.has_data ? d.median_psf : null);
    const hoverColor = getPsfColorBright(d.has_data ? d.median_psf : null);

    // If this district AND hovered
    colorStops.push(
      ['all',
        ['==', ['get', 'district'], d.district_id],
        ['boolean', ['feature-state', 'hover'], false]
      ]
    );
    colorStops.push(hoverColor);

    // If this district (not hovered)
    colorStops.push(['==', ['get', 'district'], d.district_id]);
    colorStops.push(normalColor);
  });

  // Default ghost color
  colorStops.push('rgba(100, 100, 120, 0.25)');
  return colorStops;
}

// Build height expression with hover lift
function getHeightExpression(districtData) {
  const heightStops = ['case'];

  districtData.forEach((d) => {
    const baseH = d.has_data && d.median_psf
      ? BASE_HEIGHT + d.median_psf * HEIGHT_MULTIPLIER
      : MIN_HEIGHT;
    const hoverH = baseH * HOVER_LIFT_FACTOR;

    // Hovered state - lifted
    heightStops.push(
      ['all',
        ['==', ['get', 'district'], d.district_id],
        ['boolean', ['feature-state', 'hover'], false]
      ]
    );
    heightStops.push(hoverH);

    // Normal state
    heightStops.push(['==', ['get', 'district'], d.district_id]);
    heightStops.push(baseH);
  });

  // Default minimal height
  heightStops.push(MIN_HEIGHT);
  return heightStops;
}

// Get opacity expression
function getOpacityExpression(districtData) {
  const opacityStops = ['case'];

  districtData.forEach((d) => {
    opacityStops.push(['==', ['get', 'district'], d.district_id]);
    opacityStops.push(d.has_data ? 0.9 : 0.15); // Ghost mode for no data
  });

  opacityStops.push(0.15);
  return opacityStops;
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
  const colorClass = value >= 0 ? 'text-emerald-400' : 'text-rose-400';
  return { text: `${arrow} ${Math.abs(value).toFixed(1)}%`, colorClass };
}

// Use centralized filter options
const BEDROOM_OPTIONS = BEDROOM_FILTER_OPTIONS;
const PERIOD_OPTIONS = PERIOD_FILTER_OPTIONS;

// Dark Matter map style (CARTO Dark Matter - free, no API key)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// District ID to numeric ID mapping for feature state
const DISTRICT_ID_MAP = {};
for (let i = 1; i <= 28; i++) {
  const key = i < 10 ? `D0${i}` : `D${i}`;
  DISTRICT_ID_MAP[key] = i;
}

export default function MarketHeatmap3D() {
  const [districtData, setDistrictData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBed, setSelectedBed] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('12m');
  const [hoveredDistrictId, setHoveredDistrictId] = useState(null);
  const [popupInfo, setPopupInfo] = useState(null);
  const mapRef = useRef(null);
  const hoveredStateRef = useRef(null);

  // Abort/stale request protection
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Stable filter key for dependency tracking (avoids object reference issues)
  const filterKey = useMemo(
    () => `${selectedPeriod}:${selectedBed}`,
    [selectedPeriod, selectedBed]
  );

  // Initial view state
  const [viewState, setViewState] = useState({
    longitude: SINGAPORE_CENTER.lng,
    latitude: SINGAPORE_CENTER.lat,
    zoom: SINGAPORE_CENTER.zoom,
    pitch: 40,
    bearing: -15,
  });

  // Fetch district PSF data with abort/stale protection
  const fetchData = useCallback(async () => {
    const requestId = startRequest();
    const signal = getSignal();

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/insights/district-psf', {
        params: {
          period: selectedPeriod,
          bed: selectedBed,
        },
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
  }, [selectedBed, selectedPeriod, startRequest, getSignal, isStale]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]); // Use stable filterKey instead of fetchData to avoid stale closure issues

  // Create district lookup map
  const districtMap = useMemo(() => {
    const map = {};
    districtData.forEach((d) => {
      map[d.district_id] = d;
    });
    return map;
  }, [districtData]);

  // Merge GeoJSON with live data and add numeric IDs for feature state
  const enrichedGeoJSON = useMemo(() => {
    return {
      ...singaporeDistrictsGeoJSON,
      features: singaporeDistrictsGeoJSON.features.map((feature) => {
        const districtKey = feature.properties.district;
        const data = districtMap[districtKey];
        const numericId = DISTRICT_ID_MAP[districtKey] || 0;

        return {
          ...feature,
          id: numericId, // Required for setFeatureState
          properties: {
            ...feature.properties,
            median_psf: data?.median_psf || 0,
            tx_count: data?.tx_count || 0,
            yoy_pct: data?.yoy_pct || null,
            has_data: data?.has_data || false,
          },
        };
      }),
    };
  }, [districtMap]);

  // 3D extrusion layer - "Floating Plateau" style
  const extrusionLayer = useMemo(
    () => ({
      id: 'district-extrusion',
      type: 'fill-extrusion',
      paint: {
        'fill-extrusion-color': getColorExpression(districtData),
        'fill-extrusion-height': getHeightExpression(districtData),
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': getOpacityExpression(districtData),
        'fill-extrusion-vertical-gradient': true,
        // Smooth transitions for hover lift
        'fill-extrusion-height-transition': { duration: 200, delay: 0 },
        'fill-extrusion-color-transition': { duration: 200, delay: 0 },
      },
    }),
    [districtData]
  );

  // "Grout" line layer - renders on top for clear visual separation
  const groutLayer = useMemo(
    () => ({
      id: 'district-grout',
      type: 'line',
      paint: {
        'line-color': COLORS.skyBlue,
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          2.5, // Thicker on hover
          1.5, // Normal width
        ],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.8, // Brighter on hover
          0.5, // Normal opacity
        ],
        'line-translate': [0, 0],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    }),
    []
  );

  // Handle hover with setFeatureState for performance
  const handleMapHover = useCallback(
    (event) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      // Clear previous hover state
      if (hoveredStateRef.current !== null) {
        map.setFeatureState(
          { source: 'districts', id: hoveredStateRef.current },
          { hover: false }
        );
      }

      const features = event.features;
      if (features && features.length > 0) {
        const feature = features[0];
        const districtKey = feature.properties.district;
        const numericId = DISTRICT_ID_MAP[districtKey];

        if (numericId) {
          // Set new hover state
          map.setFeatureState(
            { source: 'districts', id: numericId },
            { hover: true }
          );
          hoveredStateRef.current = numericId;
          setHoveredDistrictId(districtKey);

          // Update popup
          const data = districtMap[districtKey];
          if (data) {
            setPopupInfo({
              longitude: event.lngLat.lng,
              latitude: event.lngLat.lat,
              district: data,
              feature: feature.properties,
            });
          }
        }
      } else {
        hoveredStateRef.current = null;
        setHoveredDistrictId(null);
        setPopupInfo(null);
      }
    },
    [districtMap]
  );

  const handleMapLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map && hoveredStateRef.current !== null) {
      map.setFeatureState(
        { source: 'districts', id: hoveredStateRef.current },
        { hover: false }
      );
    }
    hoveredStateRef.current = null;
    setHoveredDistrictId(null);
    setPopupInfo(null);
  }, []);

  // Calculate PSF range for legend
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
              District PSF Heatmap
            </h2>
            <p className="text-xs md:text-sm text-[#547792] mt-0.5">
              3D visualization of median price per sqft across Singapore
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
      <div className="relative" style={{ height: '450px' }}>
        {/* Loading Overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#1a1a2e]/90 z-20 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[#547792]">Loading map data...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e] z-20">
            <div className="text-center">
              <p className="text-[#547792]">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-sm text-[#547792] hover:underline"
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
          interactiveLayerIds={['district-extrusion']}
          onMouseMove={handleMapHover}
          onMouseLeave={handleMapLeave}
          cursor={hoveredDistrictId ? 'pointer' : 'grab'}
          maxPitch={45}
          minZoom={10}
          maxZoom={14}
          maxBounds={SINGAPORE_BOUNDS}
        >
          {/* District polygons source and layers */}
          <Source id="districts" type="geojson" data={enrichedGeoJSON}>
            {/* 3D Extrusion layer (base) */}
            <Layer {...extrusionLayer} />
            {/* Grout line layer (on top) */}
            <Layer {...groutLayer} />
          </Source>

          {/* Popup/Tooltip */}
          {popupInfo && (
            <Popup
              longitude={popupInfo.longitude}
              latitude={popupInfo.latitude}
              anchor="bottom"
              closeButton={false}
              closeOnClick={false}
              offset={[0, -10]}
              className="district-popup"
            >
              <div className="bg-[#16162a]/95 backdrop-blur-md rounded-lg p-3 min-w-[200px] border border-[#94B4C1]/30 shadow-xl">
                {/* District Header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-white">
                    {popupInfo.district.district_id}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getRegionBadgeClass(popupInfo.district.region)}`}>
                    {popupInfo.district.region}
                  </span>
                </div>

                {/* District Name */}
                <p className="text-xs text-[#547792] mb-2 line-clamp-2">
                  {popupInfo.feature.name}
                </p>

                {/* Current Filter */}
                <p className="text-[10px] text-[#547792] mb-2 uppercase tracking-wider">
                  {currentBedroomLabel}
                </p>

                {/* Stats */}
                {popupInfo.district.has_data ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#547792]">Median PSF</span>
                      <span className="font-semibold text-white font-mono tabular-nums">
                        {formatPsf(popupInfo.district.median_psf)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#547792]">Observations</span>
                      <span className="font-medium text-white font-mono tabular-nums">
                        {popupInfo.district.tx_count?.toLocaleString() || 0}
                      </span>
                    </div>
                    {popupInfo.district.yoy_pct !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#547792]">YoY Change</span>
                        <span
                          className={`font-medium font-mono tabular-nums ${
                            formatYoY(popupInfo.district.yoy_pct)?.colorClass
                          }`}
                        >
                          {formatYoY(popupInfo.district.yoy_pct)?.text}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#547792] italic">
                    No transactions in selected period
                  </p>
                )}
              </div>
            </Popup>
          )}
        </Map>

        {/* Glass-morphic Filter Bar (Floating) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
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
          className="absolute top-4 right-4 z-10"
        >
          <div
            className="
            p-3 bg-[#16162a]/90 backdrop-blur-md
            border border-[#94B4C1]/30
            rounded-lg shadow-xl
          "
          >
            <p className="text-[10px] text-[#547792] uppercase tracking-wider mb-2">
              PSF Legend
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: COLORS.skyBlue }}
                />
                <span className="text-xs text-white/80">&lt; $1,400</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: COLORS.oceanBlue }}
                />
                <span className="text-xs text-white/80">$1,400 - $2,200</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: COLORS.deepNavy }}
                />
                <span className="text-xs text-white/80">&gt; $2,200</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <div className="w-4 h-4 rounded bg-gray-500/30" />
                <span className="text-xs text-white/50">No data</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Height Indicator (Floating) */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute top-4 left-4 z-10"
        >
          <div
            className="
            px-3 py-2 bg-[#16162a]/90 backdrop-blur-md
            border border-[#94B4C1]/30
            rounded-lg shadow-xl
          "
          >
            <p className="text-[10px] text-[#547792] uppercase tracking-wider">
              Height = PSF Value
            </p>
          </div>
        </motion.div>
      </div>

      {/* Stats Summary */}
      {!loading && !error && districtData.length > 0 && (
        <div className="px-4 py-3 md:px-6 md:py-4 bg-[#16162a] border-t border-[#94B4C1]/20">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] text-[#547792] uppercase tracking-wider">
                Lowest PSF
              </p>
              <p className="text-sm md:text-base font-semibold text-white font-mono tabular-nums">
                {formatPsf(psfRange.min)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#547792] uppercase tracking-wider">
                Districts
              </p>
              <p className="text-sm md:text-base font-semibold text-white font-mono tabular-nums">
                {districtData.filter((d) => d.has_data).length} / 28
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#547792] uppercase tracking-wider">
                Highest PSF
              </p>
              <p className="text-sm md:text-base font-semibold text-white font-mono tabular-nums">
                {formatPsf(psfRange.max)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Custom popup styles */}
      <style>{`
        .maplibregl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .maplibregl-popup-tip {
          display: none !important;
        }
        .district-popup .maplibregl-popup-content {
          background: transparent !important;
        }
      `}</style>
    </div>
  );
}
