/**
 * MarketHeatmap3D - 3D Visual Analytics Map for Singapore Property Market
 *
 * MapLibre GL-based 3D visualization showing Median PSF across 28 districts.
 * Features:
 * - 3D extruded polygons where height = Median PSF
 * - Dark "Dark Matter" base map style
 * - "Living Filters" bedroom toggle with glass-morphic styling
 * - Smooth height transitions on filter change
 * - "Ghost Mode" (opacity 0.1) for districts with no data
 * - Hover tooltips with district details
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Popup } from 'react-map-gl/maplibre';
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

// Height multiplier for 3D extrusion (PSF * multiplier = meters)
const HEIGHT_MULTIPLIER = 3;
const BASE_HEIGHT = 100;

// Get color based on PSF value using the specified thresholds
function getPsfColor(psf) {
  if (!psf) return 'rgba(150, 150, 150, 0.1)'; // Ghost mode
  if (psf < 1400) return COLORS.skyBlue;       // < $1,400 = Sky Blue
  if (psf < 2200) return COLORS.oceanBlue;     // $1,400-$2,200 = Ocean Blue
  return COLORS.deepNavy;                       // > $2,200 = Deep Navy
}

// Interpolate colors for MapLibre expression
function getColorExpression(districtData) {
  const colorStops = ['case'];

  districtData.forEach((d) => {
    if (d.has_data && d.median_psf) {
      colorStops.push(['==', ['get', 'district'], d.district_id]);
      colorStops.push(getPsfColor(d.median_psf));
    }
  });

  // Default ghost color for districts without data
  colorStops.push('rgba(150, 150, 150, 0.15)');

  return colorStops;
}

// Get height expression for MapLibre
function getHeightExpression(districtData) {
  const heightStops = ['case'];

  districtData.forEach((d) => {
    if (d.has_data && d.median_psf) {
      heightStops.push(['==', ['get', 'district'], d.district_id]);
      heightStops.push(BASE_HEIGHT + d.median_psf * HEIGHT_MULTIPLIER);
    }
  });

  // Default minimal height for districts without data
  heightStops.push(50);

  return heightStops;
}

// Get opacity expression for MapLibre
function getOpacityExpression(districtData) {
  const opacityStops = ['case'];

  districtData.forEach((d) => {
    opacityStops.push(['==', ['get', 'district'], d.district_id]);
    opacityStops.push(d.has_data ? 0.85 : 0.1); // Ghost mode for no data
  });

  opacityStops.push(0.1);
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

// Dark Matter map style (CARTO Dark Matter - free, no API key)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default function MarketHeatmap3D() {
  const [districtData, setDistrictData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBed, setSelectedBed] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('12m');
  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const [popupInfo, setPopupInfo] = useState(null);
  const mapRef = useRef(null);

  // Initial view state
  const [viewState, setViewState] = useState({
    longitude: SINGAPORE_CENTER.lng,
    latitude: SINGAPORE_CENTER.lat,
    zoom: SINGAPORE_CENTER.zoom,
    pitch: 45,
    bearing: -15,
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

  // Merge GeoJSON with live data
  const enrichedGeoJSON = useMemo(() => {
    if (!districtData.length) return singaporeDistrictsGeoJSON;

    return {
      ...singaporeDistrictsGeoJSON,
      features: singaporeDistrictsGeoJSON.features.map((feature) => {
        const data = districtMap[feature.properties.district];
        return {
          ...feature,
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
  }, [districtData, districtMap]);

  // 3D extrusion layer style
  const extrusionLayer = useMemo(
    () => ({
      id: 'district-extrusion',
      type: 'fill-extrusion',
      paint: {
        'fill-extrusion-color': getColorExpression(districtData),
        'fill-extrusion-height': getHeightExpression(districtData),
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.85,
        'fill-extrusion-opacity-transition': { duration: 500 },
        'fill-extrusion-height-transition': { duration: 500 },
      },
    }),
    [districtData]
  );

  // Outline layer for district borders
  const outlineLayer = useMemo(
    () => ({
      id: 'district-outline',
      type: 'line',
      paint: {
        'line-color': '#ffffff',
        'line-width': [
          'case',
          ['==', ['get', 'district'], hoveredDistrict || ''],
          3,
          1,
        ],
        'line-opacity': 0.6,
      },
    }),
    [hoveredDistrict]
  );

  // Handle map click/hover
  const handleMapHover = useCallback(
    (event) => {
      const features = event.features;
      if (features && features.length > 0) {
        const feature = features[0];
        const districtId = feature.properties.district;
        setHoveredDistrict(districtId);

        const data = districtMap[districtId];
        if (data) {
          setPopupInfo({
            longitude: event.lngLat.lng,
            latitude: event.lngLat.lat,
            district: data,
            feature: feature.properties,
          });
        }
      } else {
        setHoveredDistrict(null);
        setPopupInfo(null);
      }
    },
    [districtMap]
  );

  const handleMapLeave = useCallback(() => {
    setHoveredDistrict(null);
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
            <p className="text-xs md:text-sm text-[#94B4C1] mt-0.5">
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
                <span className="text-sm text-[#94B4C1]">Loading map data...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e] z-20">
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
          cursor={hoveredDistrict ? 'pointer' : 'grab'}
        >
          {/* District polygons source and layers */}
          <Source id="districts" type="geojson" data={enrichedGeoJSON}>
            <Layer {...extrusionLayer} />
            <Layer {...outlineLayer} />
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
                  <span
                    className={`
                    text-xs px-1.5 py-0.5 rounded font-medium
                    ${
                      popupInfo.district.region === 'CCR'
                        ? 'bg-[#213448] text-[#94B4C1]'
                        : popupInfo.district.region === 'RCR'
                        ? 'bg-[#547792] text-white'
                        : 'bg-[#94B4C1] text-[#213448]'
                    }
                  `}
                  >
                    {popupInfo.district.region}
                  </span>
                </div>

                {/* District Name */}
                <p className="text-xs text-[#94B4C1] mb-2 line-clamp-2">
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
                      <span className="text-[#94B4C1]">Median PSF</span>
                      <span className="font-semibold text-white font-mono">
                        {formatPsf(popupInfo.district.median_psf)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94B4C1]">Transactions</span>
                      <span className="font-medium text-white font-mono">
                        {popupInfo.district.tx_count?.toLocaleString() || 0}
                      </span>
                    </div>
                    {popupInfo.district.yoy_pct !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#94B4C1]">YoY Change</span>
                        <span
                          className={`font-medium font-mono ${
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
            <p className="text-[10px] text-[#94B4C1] uppercase tracking-wider mb-2">
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
            <p className="text-[10px] text-[#94B4C1] uppercase tracking-wider">
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
