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

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../api/client';
import { singaporeDistrictsGeoJSON, SINGAPORE_CENTER } from '../../data/singaporeDistrictsGeoJSON';
import { CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS } from '../../constants';

// =============================================================================
// CONFIGURATION
// =============================================================================

const MAP_CONFIG = {
  center: { longitude: SINGAPORE_CENTER.lng, latitude: SINGAPORE_CENTER.lat },
  defaultZoom: 10.8,
  maxBounds: [[103.55, 1.15], [104.15, 1.50]],
  minZoom: 10,
  maxZoom: 15,
};

// Light basemap
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// Theme colors (from design system)
const COLORS = {
  deepNavy: '#213448',
  oceanBlue: '#547792',
  skyBlue: '#94B4C1',
  sand: '#EAE0CF',
};

// Region fill colors (very subtle)
const REGION_FILLS = {
  CCR: 'rgba(33, 52, 72, 0.12)',
  RCR: 'rgba(84, 119, 146, 0.10)',
  OCR: 'rgba(148, 180, 193, 0.08)',
};

// Filter options
const BEDROOM_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '1', label: '1BR' },
  { value: '2', label: '2BR' },
  { value: '3', label: '3BR' },
  { value: '4+', label: '4+' },
];

const PERIOD_OPTIONS = [
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '1Y' },
  { value: 'all', label: 'All' },
];

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

// =============================================================================
// DISTRICT PIN COMPONENT
// =============================================================================

function DistrictPin({ district, data, zoom, onHover, onLeave, isHovered }) {
  const hasData = data?.has_data;
  const psf = data?.median_psf || 0;
  const isCompact = zoom < 11.5;

  // Color based on PSF tier
  const getPinStyle = () => {
    if (!hasData) return 'bg-[#EAE0CF] text-[#94B4C1] border-[#94B4C1]/30';
    if (psf >= 2200) return 'bg-[#213448] text-white border-[#213448]';
    if (psf >= 1400) return 'bg-[#547792] text-white border-[#547792]';
    return 'bg-white text-[#213448] border-[#94B4C1]';
  };

  // Get dot color
  const getDotColor = () => {
    if (!hasData) return 'bg-[#94B4C1]';
    if (psf >= 2200) return 'bg-[#213448]';
    if (psf >= 1400) return 'bg-[#547792]';
    return 'bg-[#547792]';
  };

  const displayValue = isCompact
    ? district.district.replace('D0', '').replace('D', '')
    : formatPsf(psf);

  return (
    <motion.div
      className="flex flex-col items-center cursor-pointer"
      onMouseEnter={() => onHover(district, data)}
      onMouseLeave={onLeave}
      animate={{ scale: isHovered ? 1.1 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Label pill */}
      <div
        className={`
          px-1.5 py-0.5 rounded-md shadow-md border font-semibold
          transition-shadow duration-200
          ${getPinStyle()}
          ${isHovered ? 'shadow-lg' : ''}
          ${isCompact ? 'text-[9px]' : 'text-[10px]'}
        `}
      >
        {hasData ? displayValue : '-'}
      </div>

      {/* Arrow pointer */}
      <div
        className={`
          w-0 h-0 -mt-px
          border-l-[4px] border-r-[4px] border-t-[4px]
          border-l-transparent border-r-transparent
          ${hasData
            ? psf >= 1400
              ? psf >= 2200 ? 'border-t-[#213448]' : 'border-t-[#547792]'
              : 'border-t-white'
            : 'border-t-[#EAE0CF]'
          }
        `}
      />

      {/* Anchor dot */}
      <div className={`w-2 h-2 rounded-full ${getDotColor()} border-2 border-white shadow-sm -mt-0.5`} />
    </motion.div>
  );
}

// =============================================================================
// HOVER CARD COMPONENT
// =============================================================================

function HoverCard({ district, data, position }) {
  if (!district || !data) return null;

  const yoyValue = data.yoy_pct;
  const hasYoY = yoyValue !== null && yoyValue !== undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute z-50 pointer-events-none"
      style={{
        left: position.x,
        top: position.y - 120,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="bg-white rounded-lg shadow-xl border border-[#94B4C1]/50 p-3 min-w-[180px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-[#213448] text-sm">
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
            <span className="text-xs text-[#547792]">Transactions</span>
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

        {/* Arrow */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-[#94B4C1]/50 rotate-45" />
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
    const regions = ['CCR', 'RCR', 'OCR'];
    const regionDistricts = {
      CCR: CCR_DISTRICTS,
      RCR: RCR_DISTRICTS,
      OCR: OCR_DISTRICTS,
    };

    return regions.map(region => {
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
    <div className="grid grid-cols-3 gap-3 px-4 py-3 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30">
      {regionStats.map(stat => (
        <div
          key={stat.region}
          className={`rounded-lg border p-3 ${regionStyles[stat.region]}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-[#213448] text-sm">
              {stat.region}
            </span>
            {stat.yoyPct !== null && (
              <span
                className={`text-xs font-bold ${
                  stat.yoyPct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {stat.yoyPct >= 0 ? '↑' : '↓'}{Math.abs(stat.yoyPct).toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#547792] mb-2">
            {regionLabels[stat.region].desc}
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-[#213448]">
              {stat.medianPsf ? formatPsf(stat.medianPsf) : '-'}
            </span>
            <span className="text-xs text-[#547792]">
              {stat.txCount.toLocaleString()} tx
            </span>
          </div>
        </div>
      ))}
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
  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const mapContainerRef = useRef(null);

  const [viewState, setViewState] = useState({
    longitude: MAP_CONFIG.center.longitude,
    latitude: MAP_CONFIG.center.latitude,
    zoom: MAP_CONFIG.defaultZoom,
    pitch: 0,
    bearing: 0,
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/insights/district-psf', {
        params: { period: selectedPeriod, bed: selectedBed },
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

  // Create district data lookup
  const districtMap = useMemo(() => {
    const map = {};
    districtData.forEach(d => {
      map[d.district_id] = d;
    });
    return map;
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
  const handleHover = useCallback((district, data, event) => {
    if (!mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = (event?.clientX || 0) - rect.left;
    const y = (event?.clientY || 0) - rect.top;
    setHoverPosition({ x, y });
    setHoveredDistrict({ district, data });
  }, []);

  const handleLeave = useCallback(() => {
    setHoveredDistrict(null);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/50 shadow-sm overflow-hidden">
      {/* Header with filters */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#213448]">
              District Price Overview
            </h2>
            <p className="text-xs text-[#547792]">
              Median PSF by postal district
            </p>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Bedroom filter */}
            <div className="flex items-center gap-1 bg-[#EAE0CF]/50 rounded-lg p-1">
              {BEDROOM_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSelectedBed(option.value)}
                  className={`
                    px-2 py-1 text-xs font-medium rounded-md transition-all
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
            <div className="flex items-center gap-1 bg-[#EAE0CF]/50 rounded-lg p-1">
              {PERIOD_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSelectedPeriod(option.value)}
                  className={`
                    px-2 py-1 text-xs font-medium rounded-md transition-all
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

      {/* Map container */}
      <div ref={mapContainerRef} className="relative" style={{ height: '480px' }}>
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

          {/* District pins */}
          {!loading && districtCentroids.map(district => {
            const data = districtMap[district.district];
            const isHovered = hoveredDistrict?.district?.district === district.district;

            return (
              <Marker
                key={district.district}
                longitude={district.centroid.lng}
                latitude={district.centroid.lat}
                anchor="bottom"
              >
                <DistrictPin
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
            <HoverCard
              district={hoveredDistrict.district}
              data={hoveredDistrict.data}
              position={hoverPosition}
            />
          )}
        </AnimatePresence>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-20">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg border border-[#94B4C1]/50 shadow-md p-2.5">
            <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold mb-2">
              PSF Range
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-[#213448]" />
                <span className="text-[10px] text-[#213448]">Premium (&gt;$2,200)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-[#547792]" />
                <span className="text-[10px] text-[#213448]">Mid-range ($1,400-$2,200)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-white border border-[#94B4C1]" />
                <span className="text-[10px] text-[#213448]">Value (&lt;$1,400)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Region summary bar */}
      {!loading && !error && districtData.length > 0 && (
        <RegionSummaryBar districtData={districtData} />
      )}

      <style>{`
        .maplibregl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
