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

import { useState, useEffect, useMemo, useCallback } from 'react';
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

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';

const COLORS = {
  deepNavy: '#213448',
  oceanBlue: '#547792',
  skyBlue: '#94B4C1',
  sand: '#EAE0CF',
};

// Liquidity tier colors (based on Z-score)
const LIQUIDITY_FILLS = {
  veryHigh: 'rgba(33, 52, 72, 0.60)',   // Deep Navy - Z > 1.5
  high: 'rgba(84, 119, 146, 0.50)',     // Ocean Blue - 0.5 < Z <= 1.5
  neutral: 'rgba(148, 180, 193, 0.35)', // Sky Blue - -0.5 <= Z <= 0.5
  low: 'rgba(234, 224, 207, 0.50)',     // Sand - -1.5 <= Z < -0.5
  veryLow: 'rgba(234, 224, 207, 0.70)', // Sand stronger - Z < -1.5
  noData: 'rgba(200, 200, 200, 0.15)',  // Gray - no data
};

// Filter options
const BEDROOM_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '1', label: '1BR' },
  { value: '2', label: '2BR' },
  { value: '3', label: '3BR' },
  { value: '4', label: '4BR' },
  { value: '5', label: '5BR+' },
];

const SALE_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'New Sale', label: 'New' },
  { value: 'Resale', label: 'Resale' },
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

function getLiquidityFill(zScore) {
  if (zScore === null || zScore === undefined) return LIQUIDITY_FILLS.noData;
  if (zScore >= 1.5) return LIQUIDITY_FILLS.veryHigh;
  if (zScore >= 0.5) return LIQUIDITY_FILLS.high;
  if (zScore >= -0.5) return LIQUIDITY_FILLS.neutral;
  if (zScore >= -1.5) return LIQUIDITY_FILLS.low;
  return LIQUIDITY_FILLS.veryLow;
}

function getTierBadgeStyle(tier) {
  switch (tier) {
    case 'Very High':
      return 'bg-[#213448] text-white';
    case 'High':
      return 'bg-[#547792] text-white';
    case 'Neutral':
      return 'bg-[#94B4C1] text-[#213448]';
    case 'Low':
      return 'bg-[#EAE0CF] text-[#547792]';
    case 'Very Low':
      return 'bg-[#EAE0CF] text-[#94B4C1]';
    default:
      return 'bg-gray-200 text-gray-500';
  }
}

// =============================================================================
// DISTRICT LABEL COMPONENT
// =============================================================================

function DistrictLabel({ district, data, zoom, onHover, onLeave, isHovered }) {
  const hasData = data?.has_data;
  const metrics = data?.liquidity_metrics || {};
  const velocity = metrics.monthly_velocity || 0;
  const tier = metrics.liquidity_tier;
  const isCompact = zoom < 11.2;

  // Color based on liquidity tier
  const getLabelStyle = () => {
    if (!hasData) return 'bg-[#EAE0CF] text-[#94B4C1] border-[#94B4C1]/30';
    switch (tier) {
      case 'Very High':
        return 'bg-[#213448] text-white border-[#213448]';
      case 'High':
        return 'bg-[#547792] text-white border-[#547792]';
      case 'Neutral':
        return 'bg-[#94B4C1] text-[#213448] border-[#94B4C1]';
      case 'Low':
      case 'Very Low':
        return 'bg-[#EAE0CF] text-[#547792] border-[#94B4C1]';
      default:
        return 'bg-white text-[#213448] border-[#94B4C1]';
    }
  };

  const getShortName = (name) => {
    if (!name) return '';
    const parts = name.split('/');
    const first = parts[0].trim();
    return first.length > 12 ? first.substring(0, 11) + '...' : first;
  };

  return (
    <motion.div
      className="flex flex-col items-center cursor-pointer"
      onMouseEnter={() => onHover(district, data)}
      onMouseLeave={onLeave}
      animate={{ scale: isHovered ? 1.05 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Velocity pill */}
      <div
        className={`
          px-2 py-0.5 rounded-md shadow-md border font-bold
          transition-shadow duration-200
          ${getLabelStyle()}
          ${isHovered ? 'shadow-lg ring-2 ring-white/50' : ''}
          ${isCompact ? 'text-[9px]' : 'text-[11px]'}
        `}
      >
        {hasData ? `${velocity.toFixed(1)}/mo` : '-'}
      </div>

      {/* District info label */}
      <div
        className={`
          mt-0.5 px-1.5 py-0.5 rounded bg-white/90 backdrop-blur-sm
          shadow-sm border border-[#94B4C1]/30
          transition-all duration-200
          ${isHovered ? 'bg-white shadow-md' : ''}
        `}
      >
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-semibold text-[#213448]">
            {district.district}
          </span>
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
// HOVER CARD COMPONENT
// =============================================================================

function HoverCard({ district, data }) {
  if (!district || !data) return null;

  const metrics = data.liquidity_metrics || {};
  const bedroom = data.bedroom_breakdown || {};

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      className="absolute z-50 pointer-events-none top-[200px] left-4"
    >
      <div className="bg-white rounded-lg shadow-xl border border-[#94B4C1]/50 p-3 w-[180px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-[#213448] text-sm">
            {district.district}
          </span>
          {metrics.liquidity_tier && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${getTierBadgeStyle(metrics.liquidity_tier)}`}>
              {metrics.liquidity_tier}
            </span>
          )}
        </div>

        {/* District name */}
        <p className="text-xs text-[#547792] mb-2 leading-tight">
          {district.name}
        </p>

        <div className="h-px bg-[#94B4C1]/30 mb-2" />

        {/* Stats */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#547792]">Monthly Velocity</span>
            <span className="font-bold text-[#213448] text-sm">
              {metrics.monthly_velocity?.toFixed(1) || 0}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-[#547792]">Transactions</span>
            <span className="font-semibold text-[#213448] text-xs">
              {metrics.tx_count?.toLocaleString() || 0}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-[#547792]">Z-Score</span>
            <span className={`font-bold text-xs ${
              (metrics.z_score || 0) >= 0 ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {metrics.z_score !== null ? metrics.z_score?.toFixed(2) : '-'}
            </span>
          </div>
        </div>

        <div className="h-px bg-[#94B4C1]/30 my-2" />

        {/* Sale Type Mix */}
        <div className="space-y-1">
          <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold">
            Sale Type Mix
          </p>
          <div className="flex gap-2">
            <div className="flex-1 bg-[#EAE0CF]/30 rounded px-2 py-1 text-center">
              <div className="text-[10px] text-[#547792]">New</div>
              <div className="text-xs font-semibold text-[#213448]">
                {metrics.new_sale_pct?.toFixed(0) || 0}%
              </div>
            </div>
            <div className="flex-1 bg-[#EAE0CF]/30 rounded px-2 py-1 text-center">
              <div className="text-[10px] text-[#547792]">Resale</div>
              <div className="text-xs font-semibold text-[#213448]">
                {metrics.resale_pct?.toFixed(0) || 0}%
              </div>
            </div>
          </div>
        </div>

        {/* Concentration / Fragility (Resale Only) */}
        {metrics.fragility_label && (
          <>
            <div className="h-px bg-[#94B4C1]/30 my-2" />
            <div className="space-y-1">
              <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold">
                Concentration Risk <span className="text-rose-400 font-normal">(resale)</span>
              </p>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  metrics.fragility_label === 'Robust'
                    ? 'bg-emerald-100 text-emerald-700'
                    : metrics.fragility_label === 'Moderate'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}>
                  {metrics.fragility_label}
                </span>
                <span className="text-[10px] text-[#547792]">
                  {metrics.resale_project_count || metrics.project_count || 0} resale projects
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#547792]">Gini Index</span>
                <span className="font-semibold text-[#213448]">
                  {metrics.concentration_gini?.toFixed(2) || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#547792]">Top Project Share</span>
                <span className="font-semibold text-[#213448]">
                  {metrics.top_project_share?.toFixed(0) || 0}%
                </span>
              </div>
            </div>
          </>
        )}

        {/* Bedroom breakdown if available */}
        {Object.keys(bedroom).length > 0 && (
          <>
            <div className="h-px bg-[#94B4C1]/30 my-2" />
            <div className="space-y-1">
              <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold">
                By Bedroom
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(bedroom).sort(([a], [b]) => Number(a) - Number(b)).map(([br, count]) => (
                  <span key={br} className="text-[9px] px-1.5 py-0.5 bg-[#EAE0CF]/50 rounded text-[#213448]">
                    {br}BR: {count}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// REGION SUMMARY BAR COMPONENT
// =============================================================================

function RegionSummaryBar({ districtData, meta }) {
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
        return { region, velocity: 0, txCount: 0, avgZScore: null };
      }

      const totalTx = districts.reduce((sum, d) => sum + (d.liquidity_metrics?.tx_count || 0), 0);
      const totalVelocity = districts.reduce((sum, d) => sum + (d.liquidity_metrics?.monthly_velocity || 0), 0);

      // Average Z-score for region
      const zScores = districts
        .filter(d => d.liquidity_metrics?.z_score !== null)
        .map(d => d.liquidity_metrics.z_score);
      const avgZScore = zScores.length > 0
        ? zScores.reduce((a, b) => a + b, 0) / zScores.length
        : null;

      return {
        region,
        velocity: totalVelocity,
        txCount: totalTx,
        avgZScore,
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
            {stat.avgZScore !== null && (
              <span
                className={`text-xs font-bold ${
                  stat.avgZScore >= 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                Z: {stat.avgZScore.toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#547792] mb-2">
            {regionLabels[stat.region].desc}
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-[#213448]">
              {stat.velocity.toFixed(1)}/mo
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

export default function DistrictLiquidityMap() {
  const [districtData, setDistrictData] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBed, setSelectedBed] = useState('all');
  const [selectedSaleType, setSelectedSaleType] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('12m');
  const [hoveredDistrict, setHoveredDistrict] = useState(null);

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
      const response = await apiClient.get('/insights/district-liquidity', {
        params: {
          period: selectedPeriod,
          bed: selectedBed,
          sale_type: selectedSaleType,
        },
      });
      setDistrictData(response.data.districts || []);
      setMeta(response.data.meta || {});
    } catch (err) {
      console.error('Failed to fetch district liquidity data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedBed, selectedSaleType, selectedPeriod]);

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

  // Dynamic fill color expression based on liquidity
  const fillColorExpression = useMemo(() => {
    const expr = ['case'];

    districtData.forEach(d => {
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
    <div className="bg-white rounded-xl border border-[#94B4C1]/50 shadow-sm overflow-hidden">
      {/* Header with filters */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#213448]">
              District Liquidity Map
            </h2>
            <p className="text-xs text-[#547792]">
              Transaction velocity by postal district (Z-score normalized)
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

            {/* Sale type filter */}
            <div className="flex items-center gap-1 bg-[#EAE0CF]/50 rounded-lg p-1">
              {SALE_TYPE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSelectedSaleType(option.value)}
                  className={`
                    px-2 py-1 text-xs font-medium rounded-md transition-all
                    ${selectedSaleType === option.value
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
      <div className="relative h-[50vh] min-h-[400px] md:h-[60vh] md:min-h-[500px] lg:h-[65vh] lg:min-h-[550px]">
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

          {/* District labels */}
          {!loading && districtCentroids.map(district => {
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
            <HoverCard
              district={hoveredDistrict.district}
              data={hoveredDistrict.data}
            />
          )}
        </AnimatePresence>

        {/* Legend - Liquidity Tiers (top-left) */}
        <div className="absolute top-4 left-4 z-20">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg border border-[#94B4C1]/50 shadow-md p-2.5 w-[165px]">
            <p className="text-[9px] text-[#547792] uppercase tracking-wider font-semibold mb-2">
              Liquidity Tier (Z-Score)
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_FILLS.veryHigh }} />
                <span className="text-[10px] text-[#213448]">Very High (&gt;1.5)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_FILLS.high }} />
                <span className="text-[10px] text-[#213448]">High (0.5 to 1.5)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_FILLS.neutral }} />
                <span className="text-[10px] text-[#213448]">Neutral (-0.5 to 0.5)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_FILLS.low }} />
                <span className="text-[10px] text-[#213448]">Low (-1.5 to -0.5)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded" style={{ backgroundColor: LIQUIDITY_FILLS.veryLow }} />
                <span className="text-[10px] text-[#213448]">Very Low (&lt;-1.5)</span>
              </div>
            </div>

            <div className="h-px bg-[#94B4C1]/30 my-2" />

            {/* Stats summary */}
            {meta.total_transactions > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#547792]">Total Tx</span>
                  <span className="font-semibold text-[#213448]">
                    {meta.total_transactions?.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#547792]">Avg Velocity</span>
                  <span className="font-semibold text-[#213448]">
                    {meta.mean_velocity?.toFixed(1)}/mo
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Region summary bar */}
      {!loading && !error && districtData.length > 0 && (
        <RegionSummaryBar districtData={districtData} meta={meta} />
      )}

      {/* District Ranking Table */}
      {!loading && !error && districtData.length > 0 && (
        <LiquidityRankingTable districtData={districtData} />
      )}

      <style>{`
        .maplibregl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

// =============================================================================
// LIQUIDITY RANKING TABLE COMPONENT
// =============================================================================

function LiquidityRankingTable({ districtData }) {
  // Sort by monthly velocity descending (highest liquidity first)
  const sortedData = useMemo(() => {
    return [...districtData]
      .filter(d => d.has_data)
      .sort((a, b) => (b.liquidity_metrics?.monthly_velocity || 0) - (a.liquidity_metrics?.monthly_velocity || 0));
  }, [districtData]);

  const getRegionBadge = (region) => {
    switch (region) {
      case 'CCR':
        return 'bg-[#213448] text-white';
      case 'RCR':
        return 'bg-[#547792] text-white';
      case 'OCR':
        return 'bg-[#94B4C1] text-[#213448]';
      default:
        return 'bg-gray-200 text-gray-600';
    }
  };

  const getFragilityBadge = (fragility) => {
    switch (fragility) {
      case 'Robust':
        return 'bg-emerald-100 text-emerald-700';
      case 'Moderate':
        return 'bg-amber-100 text-amber-700';
      case 'Fragile':
        return 'bg-rose-100 text-rose-700';
      default:
        return 'bg-gray-100 text-gray-500';
    }
  };

  const getTierBadge = (tier) => {
    switch (tier) {
      case 'Very High':
        return 'bg-[#213448] text-white';
      case 'High':
        return 'bg-[#547792] text-white';
      case 'Neutral':
        return 'bg-[#94B4C1] text-[#213448]';
      case 'Low':
        return 'bg-[#EAE0CF] text-[#547792]';
      case 'Very Low':
        return 'bg-[#EAE0CF] text-[#94B4C1]';
      default:
        return 'bg-gray-100 text-gray-500';
    }
  };

  return (
    <div className="border-t border-[#94B4C1]/30">
      {/* Table Header */}
      <div className="px-4 py-3 bg-[#EAE0CF]/20">
        <h3 className="text-sm font-bold text-[#213448]">
          District Liquidity Ranking
        </h3>
        <p className="text-xs text-[#547792]">
          Sorted by monthly transaction velocity (highest liquidity first)
        </p>
      </div>

      {/* Scrollable Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {/* Group Header Row - Exit Safety + Concentration (Resale-only) */}
            <tr className="bg-[#EAE0CF]/20">
              <th colSpan={6} className="border-b border-[#94B4C1]/20"></th>
              <th
                colSpan={3}
                className="px-3 py-1.5 text-center text-[10px] font-bold text-[#547792] uppercase tracking-wider border-l-2 border-t-2 border-dashed border-emerald-400/60 bg-emerald-50/30"
                title="Exit Safety metrics: Velocity, Z-Score, Tier calculated on RESALE only (organic demand signal)"
              >
                Exit Safety
                <span className="ml-1 text-[8px] font-normal text-emerald-500">(resale)</span>
              </th>
              <th colSpan={2} className="border-b border-[#94B4C1]/20"></th>
              <th
                colSpan={3}
                className="px-3 py-1.5 text-center text-[10px] font-bold text-[#547792] uppercase tracking-wider border-l-2 border-r-2 border-t-2 border-dashed border-rose-400/60 bg-rose-50/30"
                title="Concentration metrics: Gini, Fragility, Top Share calculated on RESALE only (avoids developer release distortion)"
              >
                Concentration Risks
                <span className="ml-1 text-[8px] font-normal text-rose-400">(resale)</span>
              </th>
            </tr>
            {/* Column Header Row */}
            <tr className="bg-[#EAE0CF]/30 border-b border-[#94B4C1]/30">
              <th className="px-3 py-2 text-left font-semibold text-[#213448] whitespace-nowrap">Rank</th>
              <th className="px-3 py-2 text-left font-semibold text-[#213448] whitespace-nowrap">District</th>
              <th className="px-3 py-2 text-left font-semibold text-[#213448] whitespace-nowrap min-w-[200px]">Area</th>
              <th className="px-3 py-2 text-center font-semibold text-[#213448] whitespace-nowrap">Region</th>
              <th className="px-3 py-2 text-right font-semibold text-[#213448] whitespace-nowrap">Projects</th>
              <th className="px-3 py-2 text-right font-semibold text-[#213448] whitespace-nowrap">Transactions</th>
              <th className="px-3 py-2 text-center font-semibold text-[#213448] whitespace-nowrap border-l-2 border-dashed border-emerald-400/60">Tier</th>
              <th className="px-3 py-2 text-right font-semibold text-[#213448] whitespace-nowrap">Velocity/mo</th>
              <th className="px-3 py-2 text-right font-semibold text-[#213448] whitespace-nowrap">Z-Score</th>
              <th className="px-3 py-2 text-right font-semibold text-[#213448] whitespace-nowrap">New %</th>
              <th className="px-3 py-2 text-right font-semibold text-[#213448] whitespace-nowrap">Resale %</th>
              <th className="px-3 py-2 text-center font-semibold text-[#213448] whitespace-nowrap border-l-2 border-dashed border-rose-400/60">Fragility</th>
              <th className="px-3 py-2 text-right font-semibold text-[#213448] whitespace-nowrap">Gini</th>
              <th className="px-3 py-2 text-right font-semibold text-[#213448] whitespace-nowrap border-r-2 border-dashed border-rose-400/60">Top Share</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((district, index) => {
              const m = district.liquidity_metrics || {};
              return (
                <tr
                  key={district.district_id}
                  className={`border-b border-[#94B4C1]/20 hover:bg-[#EAE0CF]/20 transition-colors ${
                    index < 3 ? 'bg-[#EAE0CF]/10' : ''
                  }`}
                >
                  {/* Rank */}
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      index === 0 ? 'bg-amber-400 text-white' :
                      index === 1 ? 'bg-gray-300 text-gray-700' :
                      index === 2 ? 'bg-amber-600 text-white' :
                      'bg-[#EAE0CF]/50 text-[#547792]'
                    }`}>
                      {index + 1}
                    </span>
                  </td>

                  {/* District ID */}
                  <td className="px-3 py-2 font-semibold text-[#213448]">
                    {district.district_id}
                  </td>

                  {/* Full Area Name */}
                  <td className="px-3 py-2 text-[#547792]">
                    {district.full_name}
                  </td>

                  {/* Region Badge */}
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${getRegionBadge(district.region)}`}>
                      {district.region}
                    </span>
                  </td>

                  {/* Project Count (Market Structure - Combined) */}
                  <td className="px-3 py-2 text-right text-[#547792]">
                    {m.project_count || 0}
                  </td>

                  {/* Transaction Count (Market Structure - Combined) */}
                  <td className="px-3 py-2 text-right text-[#213448]">
                    {m.tx_count?.toLocaleString() || '0'}
                  </td>

                  {/* Exit Safety Group - Liquidity Tier (Resale-only) */}
                  <td className="px-3 py-2 text-center border-l-2 border-dashed border-emerald-400/60">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${getTierBadge(m.liquidity_tier)}`}>
                      {m.liquidity_tier || '-'}
                    </span>
                  </td>

                  {/* Exit Safety Group - Monthly Velocity (Resale-only) */}
                  <td className="px-3 py-2 text-right font-bold text-[#213448]">
                    {m.monthly_velocity?.toFixed(1) || '0'}
                  </td>

                  {/* Exit Safety Group - Z-Score (Resale-only) */}
                  <td className="px-3 py-2 text-right">
                    <span className={`font-semibold ${
                      (m.z_score || 0) >= 0.5 ? 'text-emerald-600' :
                      (m.z_score || 0) <= -0.5 ? 'text-rose-600' :
                      'text-[#547792]'
                    }`}>
                      {m.z_score?.toFixed(2) || '-'}
                    </span>
                  </td>

                  {/* New Sale % (Market Structure - Combined) */}
                  <td className="px-3 py-2 text-right text-[#547792]">
                    {m.new_sale_pct?.toFixed(0) || '0'}%
                  </td>

                  {/* Resale % (Market Structure - Combined) */}
                  <td className="px-3 py-2 text-right text-[#547792]">
                    {m.resale_pct?.toFixed(0) || '0'}%
                  </td>

                  {/* Concentration Risks Group - Fragility Badge (Resale-only) */}
                  <td className="px-3 py-2 text-center border-l-2 border-dashed border-rose-400/60">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${getFragilityBadge(m.fragility_label)}`}>
                      {m.fragility_label || '-'}
                    </span>
                  </td>

                  {/* Concentration Risks Group - Gini Index (Resale-only) */}
                  <td className="px-3 py-2 text-right text-[#547792]">
                    {m.concentration_gini?.toFixed(2) || '-'}
                  </td>

                  {/* Concentration Risks Group - Top Project Share (Resale-only) */}
                  <td className="px-3 py-2 text-right text-[#547792] border-r-2 border-dashed border-rose-400/60">
                    {m.top_project_share?.toFixed(0) || '0'}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="px-4 py-2 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30 text-xs text-[#547792]">
        Showing {sortedData.length} districts with transaction data
      </div>
    </div>
  );
}
