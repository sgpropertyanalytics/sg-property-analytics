/**
 * MarketStrategyMap - "Institutional Grade" Command Center
 *
 * Target Aesthetic: Bloomberg Terminal meets Modern SaaS
 * Core UX: Fixed-context dashboard that allows exploration but prevents getting lost
 *
 * Key Design Decisions:
 * - RIGHT-HAND CONTROL STACK - All controls consolidated top-right, bottom is 100% map
 * - HARD-CODED center (1.3521) - true center now that bottom UI is cleared
 * - Layer order: Fill FIRST, Line SECOND (line renders on top with "white grout" effect)
 *
 * Features:
 * - Bounded exploration ("Playpen") - drag enabled with elastic maxBounds
 * - Price/Volume view mode toggle for different insights
 * - Zoom-responsive markers (dots at overview, pills when zoomed)
 * - High-contrast "White Grout" style boundaries (0.6 opacity)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../api/client';
import { singaporeDistrictsGeoJSON } from '../../data/singaporeDistrictsGeoJSON';

// =============================================================================
// MAP CONFIGURATION - Optimized for Right-Hand Control Stack Layout
// =============================================================================

const MAP_CONFIG = {
  // True center of Singapore - bottom UI is gone, no need to shift north
  center: {
    longitude: 103.8198,
    latitude: 1.3521,
  },

  // Goldilocks zoom - 10.6 guarantees full visibility
  defaultZoom: 10.6,

  // "Playpen" - elastic walls that prevent users from getting lost
  maxBounds: [
    [103.55, 1.15],  // Southwest
    [104.15, 1.50],  // Northeast
  ],

  // Zoom constraints
  minZoom: 10,
  maxZoom: 16,
};

// Theme colors (Warm Precision palette)
const COLORS = {
  deepNavy: '#213448',
  oceanBlue: '#547792',
  skyBlue: '#94B4C1',
  sand: '#EAE0CF',
  void: '#0f172a',
};

// Region colors for boundaries
const REGION_BOUNDARY_COLORS = {
  CCR: '#FFD700',  // Gold for Core Central
  RCR: '#00CED1',  // Cyan for Rest of Central
  OCR: '#98FB98',  // Pale green for Outside Central
};

// Volume "Hot" gradient colors
const VOLUME_COLORS = {
  low: '#FDE68A',
  medium: '#F59E0B',
  high: '#B91C1C',
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

function getPsfColor(psf, hasData) {
  if (!hasData || !psf) return '#3a3a4a';
  if (psf < 1400) return COLORS.skyBlue;
  if (psf < 2200) return COLORS.oceanBlue;
  return COLORS.deepNavy;
}

function getVolumeColor(txCount, hasData, maxVolume) {
  if (!hasData || !txCount) return '#3a3a4a';
  const ratio = txCount / maxVolume;
  if (ratio < 0.33) return VOLUME_COLORS.low;
  if (ratio < 0.66) return VOLUME_COLORS.medium;
  return VOLUME_COLORS.high;
}

function getPriceColorExpression(districtData) {
  const colorStops = ['case'];
  districtData.forEach((d) => {
    colorStops.push(['==', ['get', 'district'], d.district_id]);
    colorStops.push(getPsfColor(d.median_psf, d.has_data));
  });
  colorStops.push('#3a3a4a');
  return colorStops;
}

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

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// =============================================================================
// LEVITATING FLAG MARKER COMPONENT
// =============================================================================

/**
 * LevitatingFlag - Creative "Stem + Flag" Marker Design
 *
 * Structure (Flex Column):
 * - Top: The "Flag" (Price/Volume pill with YoY indicator)
 * - Middle: Vertical "Stem" (height correlates to price)
 * - Bottom: "Base" anchor (pulses for hot areas)
 *
 * IMPROVED: Now shows YoY change and transaction count without hover
 */
function LevitatingFlag({ district, data, viewMode, zoom, isTopExpensive, isHotVolume }) {
  const [isHovered, setIsHovered] = useState(false);
  const yoy = data?.yoy_pct !== null ? formatYoY(data.yoy_pct) : null;
  const hasData = data?.has_data;
  const psf = data?.median_psf || 0;
  const txCount = data?.tx_count || 0;
  const yoyValue = data?.yoy_pct;

  // Determine stem height based on price (histogram effect)
  const getStemHeight = () => {
    if (viewMode === 'VOLUME') {
      if (txCount < 200) return 'h-2';
      if (txCount < 500) return 'h-4';
      return 'h-6';
    }
    if (psf < 1400) return 'h-2';
    if (psf < 2500) return 'h-4';
    return 'h-6';
  };

  // Display modes based on zoom level
  const isCompactMode = zoom < 11.5;
  const isDetailMode = zoom >= 12.5;

  // Primary display value
  const displayValue = isCompactMode
    ? district.district.replace('D0', '').replace('D', '')
    : viewMode === 'PRICE'
      ? formatPsf(psf)
      : txCount.toLocaleString();

  // Flag styling with YoY-aware border glow
  const getFlagStyle = () => {
    if (!hasData) {
      return 'bg-slate-700/80 text-slate-400 border-slate-600';
    }
    if (isTopExpensive && viewMode === 'PRICE') {
      return 'bg-[#213448] text-amber-400 border-amber-400/60 shadow-amber-500/30';
    }
    if (isHotVolume && viewMode === 'VOLUME') {
      return 'bg-[#B91C1C] text-white border-orange-400/60 shadow-red-500/30';
    }
    if (psf >= 2200 && viewMode === 'PRICE') {
      return 'bg-[#213448] text-white border-[#94B4C1]/50 shadow-[#213448]/40';
    }
    return 'bg-white text-slate-900 border-slate-200 shadow-black/20';
  };

  // YoY indicator color
  const getYoYStyle = () => {
    if (!yoyValue && yoyValue !== 0) return null;
    if (yoyValue >= 10) return 'bg-emerald-500 text-white';
    if (yoyValue > 0) return 'bg-emerald-500/80 text-white';
    if (yoyValue <= -10) return 'bg-rose-500 text-white';
    if (yoyValue < 0) return 'bg-rose-500/80 text-white';
    return 'bg-slate-500 text-white';
  };

  return (
    <div
      className="relative cursor-pointer select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Vertical Stack: Flag + YoY Badge + Stem + Base */}
      <div className="flex flex-col items-center">
        {/* THE FLAG (Top) - Now with dual metrics when zoomed */}
        <motion.div
          animate={{
            y: isHovered ? -4 : 0,
            scale: isHovered ? 1.08 : 1,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className={`
            ${isCompactMode ? 'px-1.5 py-0.5' : 'px-2 py-1'}
            rounded-md font-bold shadow-xl border-2
            transition-all duration-200 whitespace-nowrap
            ${getFlagStyle()}
            ${isHovered ? 'shadow-2xl ring-2 ring-white/40' : ''}
            ${isTopExpensive && viewMode === 'PRICE' ? 'ring-1 ring-amber-400/30' : ''}
          `}
          style={{ backdropFilter: 'blur(4px)' }}
        >
          {hasData ? (
            <div className="flex flex-col items-center">
              {/* Primary value */}
              <span className={isCompactMode ? 'text-[8px]' : 'text-[10px]'}>
                {displayValue}
              </span>
              {/* Secondary: Transaction count (in Price mode, when zoomed) */}
              {!isCompactMode && viewMode === 'PRICE' && isDetailMode && (
                <span className="text-[7px] opacity-70 -mt-0.5">
                  {txCount.toLocaleString()} tx
                </span>
              )}
            </div>
          ) : '-'}
        </motion.div>

        {/* YoY INDICATOR - Visible without hover! */}
        {hasData && yoyValue !== null && yoyValue !== undefined && !isCompactMode && (
          <div
            className={`
              mt-0.5 px-1 py-0.5 rounded text-[7px] font-bold
              ${getYoYStyle()}
            `}
          >
            {yoyValue >= 0 ? '↑' : '↓'}{Math.abs(yoyValue).toFixed(0)}%
          </div>
        )}

        {/* THE STEM (Middle) */}
        <motion.div
          animate={{ scaleY: isHovered ? 1.2 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className={`
            w-[1.5px] ${getStemHeight()}
            ${hasData
              ? isTopExpensive && viewMode === 'PRICE'
                ? 'bg-gradient-to-b from-amber-400/80 to-amber-400/20'
                : 'bg-gradient-to-b from-white/60 to-white/20'
              : 'bg-slate-600/40'
            }
            origin-top
          `}
        />

        {/* THE BASE (Bottom) - Anchor Point */}
        <div
          className={`
            w-2 h-2 rounded-full
            ${hasData
              ? isHotVolume
                ? 'bg-orange-400 animate-pulse shadow-lg shadow-orange-500/50'
                : isTopExpensive && viewMode === 'PRICE'
                ? 'bg-amber-400 shadow-lg shadow-amber-500/50'
                : 'bg-white/80 shadow-sm'
              : 'bg-slate-600/50'
            }
          `}
        />
      </div>

      {/* Hover Tooltip */}
      <AnimatePresence>
        {isHovered && hasData && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50"
            style={{ marginBottom: '40px' }} // Extra margin to clear the flag
          >
            <div className="bg-white rounded-xl p-3 min-w-[180px] border border-slate-200 shadow-2xl">
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

              {isTopExpensive && viewMode === 'PRICE' && (
                <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-[10px] text-amber-700 font-semibold text-center">
                    ⭐ Top 3 Most Expensive
                  </p>
                </div>
              )}

              <div className="h-px bg-slate-100 mb-2" />

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
  const [viewMode, setViewMode] = useState('PRICE');
  const mapRef = useRef(null);

  const [viewState, setViewState] = useState({
    longitude: MAP_CONFIG.center.longitude,
    latitude: MAP_CONFIG.center.latitude,
    zoom: MAP_CONFIG.defaultZoom,
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

  const maxVolume = useMemo(() => {
    const volumes = districtData.filter((d) => d.tx_count).map((d) => d.tx_count);
    return volumes.length > 0 ? Math.max(...volumes) : 1;
  }, [districtData]);

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

  // Create region boundary layer expression (thicker lines for region boundaries)
  const regionBorderExpression = useMemo(() => {
    // Districts on region boundaries get highlighted
    const regionGroups = {
      CCR: ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11'],
      RCR: ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20'],
      OCR: ['D16', 'D17', 'D18', 'D19', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28'],
    };

    const colorExpr = ['case'];
    Object.entries(regionGroups).forEach(([region, districts]) => {
      districts.forEach((d) => {
        colorExpr.push(['==', ['get', 'district'], d]);
        colorExpr.push(REGION_BOUNDARY_COLORS[region]);
      });
    });
    colorExpr.push('#FFFFFF');

    return colorExpr;
  }, []);

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

  // "Cookie Cutter" border layer - HIGH CONTRAST to prevent visual merging
  // Thick white lines create a "Demilitarized Zone" between same-colored districts
  const lineLayer = useMemo(
    () => ({
      id: 'district-borders',
      type: 'line',
      paint: {
        'line-color': '#FFFFFF',   // Pure White (Max Contrast)
        'line-width': 1.5,         // Slightly thinner for district borders
        'line-opacity': 0.6,       // Subtle for district borders
        'line-blur': 0,            // Sharp, crisp lines
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    }),
    []
  );

  // Region boundary layer - colored outlines showing CCR/RCR/OCR regions
  const regionLineLayer = useMemo(
    () => ({
      id: 'region-borders',
      type: 'line',
      paint: {
        'line-color': regionBorderExpression,
        'line-width': 3,           // Thicker for region boundaries
        'line-opacity': 0.7,
        'line-blur': 0,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    }),
    [regionBorderExpression]
  );

  const psfRange = useMemo(() => {
    const validDistricts = districtData.filter((d) => d.median_psf);
    if (validDistricts.length === 0) return { min: 0, max: 0, minDistrict: null, maxDistrict: null };

    const sorted = [...validDistricts].sort((a, b) => a.median_psf - b.median_psf);
    const minD = sorted[0];
    const maxD = sorted[sorted.length - 1];

    return {
      min: minD.median_psf,
      max: maxD.median_psf,
      minDistrict: minD.district_id,
      maxDistrict: maxD.district_id,
    };
  }, [districtData]);

  const volumeRange = useMemo(() => {
    const validDistricts = districtData.filter((d) => d.tx_count);
    if (validDistricts.length === 0) return { min: 0, max: 0, total: 0, minDistrict: null, maxDistrict: null };

    const sorted = [...validDistricts].sort((a, b) => a.tx_count - b.tx_count);
    const minD = sorted[0];
    const maxD = sorted[sorted.length - 1];

    return {
      min: minD.tx_count,
      max: maxD.tx_count,
      total: validDistricts.reduce((a, b) => a + b.tx_count, 0),
      minDistrict: minD.district_id,
      maxDistrict: maxD.district_id,
    };
  }, [districtData]);

  // Top 3 most expensive districts - these get gold "premium" styling
  const topExpensiveDistricts = useMemo(() => {
    return districtData
      .filter((d) => d.has_data && d.median_psf)
      .sort((a, b) => b.median_psf - a.median_psf)
      .slice(0, 3)
      .map((d) => d.district_id);
  }, [districtData]);

  // "Hot" volume districts - top 20% by transaction count get pulsing base
  const hotVolumeDistricts = useMemo(() => {
    const districtsWithVolume = districtData.filter((d) => d.has_data && d.tx_count);
    if (districtsWithVolume.length === 0) return [];

    const sorted = [...districtsWithVolume].sort((a, b) => b.tx_count - a.tx_count);
    const top20Percent = Math.max(1, Math.ceil(sorted.length * 0.2));
    return sorted.slice(0, top20Percent).map((d) => d.district_id);
  }, [districtData]);

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

          {/* Period Filter - stays in header on desktop */}
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

      {/* Map Container - Bottom is now 100% clear */}
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
          <Source id="districts" type="geojson" data={singaporeDistrictsGeoJSON}>
            {/* Layer order: Fill (bottom) → Region borders → District borders (top) */}
            <Layer {...fillLayer} />
            <Layer {...regionLineLayer} />
            <Layer {...lineLayer} />
          </Source>

          {/* Levitating Data Flags - stems grow taller with price */}
          {!loading && districtCentroids.map((district) => {
            const data = districtMap[district.district];
            const isTopExpensive = topExpensiveDistricts.includes(district.district);
            const isHotVolume = hotVolumeDistricts.includes(district.district);

            return (
              <Marker
                key={district.district}
                longitude={district.centroid.lng}
                latitude={district.centroid.lat}
                anchor="bottom" // Anchor at base of the "stem"
              >
                <LevitatingFlag
                  district={district}
                  data={data}
                  viewMode={viewMode}
                  zoom={viewState.zoom}
                  isTopExpensive={isTopExpensive}
                  isHotVolume={isHotVolume}
                />
              </Marker>
            );
          })}
        </Map>

        {/* ============================================================= */}
        {/* RIGHT-HAND CONTROL STACK - All controls consolidated here */}
        {/* ============================================================= */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute top-4 right-4 z-20 flex flex-col gap-3 w-[180px]"
        >
          {/* Row 1: View Mode Toggle */}
          <div className="p-2 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-xl shadow-xl">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
              View Mode
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('PRICE')}
                className={`
                  flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg transition-all
                  ${viewMode === 'PRICE'
                    ? 'bg-[#547792] text-white shadow'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }
                `}
              >
                💲 Price
              </button>
              <button
                onClick={() => setViewMode('VOLUME')}
                className={`
                  flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg transition-all
                  ${viewMode === 'VOLUME'
                    ? 'bg-orange-500 text-white shadow'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }
                `}
              >
                🔥 Volume
              </button>
            </div>
          </div>

          {/* Row 2: Unit Type Filter */}
          <div className="p-2 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-xl shadow-xl">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
              Unit Type
            </p>
            <div className="grid grid-cols-5 gap-1">
              {BEDROOM_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedBed(option.value)}
                  className={`
                    px-1 py-1.5 text-[9px] font-semibold rounded-md transition-all
                    ${selectedBed === option.value
                      ? 'bg-[#547792] text-white shadow'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Legend */}
          <div className="p-2.5 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-xl shadow-xl">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
              {viewMode === 'PRICE' ? 'Market Segments' : 'Activity Level'}
            </p>
            <div className="space-y-1.5">
              {viewMode === 'PRICE' ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.deepNavy }} />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-white font-semibold">CCR</span>
                      <span className="text-[8px] text-slate-400">&gt; $2,200 psf</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.oceanBlue }} />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-white font-semibold">RCR</span>
                      <span className="text-[8px] text-slate-400">$1,400 - $2,199</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.skyBlue }} />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-white font-semibold">OCR</span>
                      <span className="text-[8px] text-slate-400">&lt; $1,400 psf</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-600/50 mt-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3a3a4a' }} />
                    <span className="text-[10px] text-slate-400">No data</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: VOLUME_COLORS.high }} />
                    <span className="text-[10px] text-white">High activity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: VOLUME_COLORS.medium }} />
                    <span className="text-[10px] text-white">Medium</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: VOLUME_COLORS.low }} />
                    <span className="text-[10px] text-white">Low activity</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-600/50 mt-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3a3a4a' }} />
                    <span className="text-[10px] text-slate-400">No data</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Row 4: YoY Legend */}
          <div className="p-2.5 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-xl shadow-xl">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
              YoY Change
            </p>
            <div className="flex flex-wrap gap-1.5">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded bg-emerald-500" />
                <span className="text-[9px] text-slate-300">Up</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded bg-rose-500" />
                <span className="text-[9px] text-slate-300">Down</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Instructions - top left */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute top-4 left-4 z-20"
        >
          <div className="px-2.5 py-1.5 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-lg shadow-xl">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">
              Drag &bull; Scroll &bull; Hover
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
                  {psfRange.minDistrict && (
                    <p className="text-[10px] text-slate-400">{psfRange.minDistrict}</p>
                  )}
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Districts
                  </p>
                  <p className="text-sm md:text-base font-bold text-white">
                    {districtData.filter((d) => d.has_data).length} / 28
                  </p>
                  <p className="text-[10px] text-slate-400">with data</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Highest PSF
                  </p>
                  <p className="text-sm md:text-base font-bold text-amber-400">
                    {formatPsf(psfRange.max)}
                  </p>
                  {psfRange.maxDistrict && (
                    <p className="text-[10px] text-slate-400">{psfRange.maxDistrict}</p>
                  )}
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
                  <p className="text-[10px] text-slate-400">transactions</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Busiest
                  </p>
                  <p className="text-sm md:text-base font-bold text-orange-400">
                    {volumeRange.max.toLocaleString()} tx
                  </p>
                  {volumeRange.maxDistrict && (
                    <p className="text-[10px] text-slate-400">{volumeRange.maxDistrict}</p>
                  )}
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    Quietest
                  </p>
                  <p className="text-sm md:text-base font-bold text-white">
                    {volumeRange.min.toLocaleString()} tx
                  </p>
                  {volumeRange.minDistrict && (
                    <p className="text-[10px] text-slate-400">{volumeRange.minDistrict}</p>
                  )}
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
        .maplibregl-map {
          background-color: ${COLORS.void} !important;
        }
      `}</style>
    </div>
  );
}
