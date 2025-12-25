/**
 * MarketHeatmap - Visual Analytics Map for Singapore Property Market
 *
 * SVG-based choropleth visualization showing Median PSF across 28 districts.
 * Features:
 * - "Living Filters" bedroom toggle with animated transitions
 * - Color gradient based on PSF values (project theme colors)
 * - "Ghost" effect for districts with no data
 * - Hover tooltips with district details and YoY trends
 * - Responsive design for all device sizes
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '../../api/client';
import {
  DISTRICT_PATHS,
  DISTRICT_CENTROIDS,
  DISTRICT_SHORT_NAMES,
  DISTRICT_REGIONS,
  ALL_DISTRICTS,
} from '../../data/singaporeDistricts';
import { useStaleRequestGuard } from '../../hooks';

// Color scale for PSF values (using project theme)
const PSF_COLOR_SCALE = {
  // Low PSF: Muted/cool tones
  low: { color: '#94B4C1', label: '< $1,400' },      // Sky Blue
  lowMid: { color: '#7BA3B2', label: '$1,400-1,700' },
  mid: { color: '#547792', label: '$1,700-2,000' },  // Ocean Blue
  midHigh: { color: '#3D5A6E', label: '$2,000-2,500' },
  high: { color: '#213448', label: '> $2,500' },     // Deep Navy
};

// Get color based on PSF value
function getPsfColor(psf) {
  if (!psf) return '#E5E7EB'; // Gray for no data
  if (psf < 1400) return PSF_COLOR_SCALE.low.color;
  if (psf < 1700) return PSF_COLOR_SCALE.lowMid.color;
  if (psf < 2000) return PSF_COLOR_SCALE.mid.color;
  if (psf < 2500) return PSF_COLOR_SCALE.midHigh.color;
  return PSF_COLOR_SCALE.high.color;
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
  const color = value >= 0 ? 'text-green-600' : 'text-red-600';
  return { text: `${arrow} ${Math.abs(value).toFixed(1)}%`, color };
}

// Bedroom filter options
const BEDROOM_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '1', label: '1BR' },
  { value: '2', label: '2BR' },
  { value: '3', label: '3BR' },
  { value: '4', label: '4BR' },
  { value: '5', label: '5BR+' },
];

// Period filter options
const PERIOD_OPTIONS = [
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '1Y' },
  { value: 'all', label: 'All' },
];

export default function MarketHeatmap() {
  const [districtData, setDistrictData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBed, setSelectedBed] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('12m');
  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Abort/stale request protection
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Stable filter key for dependency tracking (avoids object reference issues)
  const filterKey = useMemo(
    () => `${selectedPeriod}:${selectedBed}`,
    [selectedPeriod, selectedBed]
  );

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
  }, [filterKey]); // Use stable filterKey instead of fetchData to avoid stale closure issues

  // Create a map for quick district lookup
  const districtMap = useMemo(() => {
    const map = {};
    districtData.forEach((d) => {
      map[d.district_id] = d;
    });
    return map;
  }, [districtData]);

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

  // Handle mouse move for tooltip positioning
  const handleMouseMove = useCallback((e, districtId) => {
    const rect = e.currentTarget.closest('svg').getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setHoveredDistrict(districtId);
  }, []);

  // Get district info for tooltip
  const hoveredDistrictData = hoveredDistrict
    ? districtMap[hoveredDistrict]
    : null;

  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 md:px-6 md:py-4 border-b border-[#94B4C1]/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-[#213448]">
              District PSF Heatmap
            </h2>
            <p className="text-xs md:text-sm text-[#547792] mt-0.5">
              Median price per sqft across Singapore&apos;s 28 postal districts
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
                      : 'bg-[#EAE0CF]/30 text-[#547792] hover:bg-[#EAE0CF]/50'
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
      <div className="relative p-4 md:p-6">
        {/* Loading Overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[#547792]">Loading...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && !loading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-[#547792]">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-sm text-[#213448] hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* SVG Map */}
        {!error && (
          <div className="relative">
            <svg
              viewBox="0 0 400 240"
              className="w-full h-auto max-h-[400px]"
              style={{ minHeight: '200px' }}
            >
              {/* District Polygons */}
              {ALL_DISTRICTS.map((districtId) => {
                const data = districtMap[districtId];
                const hasData = data?.has_data;
                const path = DISTRICT_PATHS[districtId];
                const color = hasData
                  ? getPsfColor(data.median_psf)
                  : '#F3F4F6';
                const isHovered = hoveredDistrict === districtId;

                return (
                  <motion.path
                    key={districtId}
                    d={path}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{
                      opacity: hasData ? 1 : 0.4,
                      scale: 1,
                      fill: color,
                    }}
                    whileHover={{
                      scale: 1.02,
                      filter: 'brightness(1.1)',
                    }}
                    transition={{
                      duration: 0.3,
                      ease: 'easeOut',
                    }}
                    className={`
                      cursor-pointer
                      transition-all duration-200
                      ${hasData ? '' : 'opacity-40'}
                    `}
                    style={{
                      stroke: isHovered ? '#213448' : '#FFFFFF',
                      strokeWidth: isHovered ? 2 : 1,
                      filter: hasData
                        ? isHovered
                          ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))'
                          : 'none'
                        : 'grayscale(0.5)',
                    }}
                    onMouseMove={(e) => handleMouseMove(e, districtId)}
                    onMouseLeave={() => setHoveredDistrict(null)}
                  />
                );
              })}

              {/* District Labels (only show on larger screens) */}
              {ALL_DISTRICTS.map((districtId) => {
                const centroid = DISTRICT_CENTROIDS[districtId];
                const data = districtMap[districtId];
                const hasData = data?.has_data;
                if (!hasData) return null;

                return (
                  <text
                    key={`label-${districtId}`}
                    x={centroid.x}
                    y={centroid.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none hidden md:block"
                    style={{
                      fontSize: '7px',
                      fontWeight: 600,
                      fill: data.median_psf > 2000 ? '#FFFFFF' : '#213448',
                      textShadow:
                        data.median_psf > 2000
                          ? '0 1px 2px rgba(0,0,0,0.3)'
                          : 'none',
                    }}
                  >
                    {districtId.replace('D0', 'D').replace('D', '')}
                  </text>
                );
              })}
            </svg>

            {/* Tooltip */}
            <AnimatePresence>
              {hoveredDistrictData && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute z-20 pointer-events-none"
                  style={{
                    left: Math.min(tooltipPos.x + 10, 280),
                    top: tooltipPos.y + 10,
                  }}
                >
                  <div className="bg-white rounded-lg shadow-lg border border-[#94B4C1]/30 p-3 min-w-[180px]">
                    {/* District Header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-[#213448]">
                        {hoveredDistrictData.district_id}
                      </span>
                      <span
                        className={`
                        text-xs px-1.5 py-0.5 rounded
                        ${
                          hoveredDistrictData.region === 'CCR'
                            ? 'bg-[#213448] text-white'
                            : hoveredDistrictData.region === 'RCR'
                            ? 'bg-[#547792] text-white'
                            : 'bg-[#94B4C1] text-[#213448]'
                        }
                      `}
                      >
                        {hoveredDistrictData.region}
                      </span>
                    </div>

                    {/* District Name */}
                    <p className="text-xs text-[#547792] mb-2 line-clamp-2">
                      {hoveredDistrictData.full_name || hoveredDistrictData.name}
                    </p>

                    {/* Stats */}
                    {hoveredDistrictData.has_data ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-[#547792]">Median PSF</span>
                          <span className="font-semibold text-[#213448] font-mono">
                            {formatPsf(hoveredDistrictData.median_psf)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[#547792]">Transactions</span>
                          <span className="font-medium text-[#213448] font-mono">
                            {hoveredDistrictData.tx_count?.toLocaleString() ||
                              0}
                          </span>
                        </div>
                        {hoveredDistrictData.yoy_pct !== null && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[#547792]">YoY Change</span>
                            <span
                              className={`font-medium font-mono ${
                                formatYoY(hoveredDistrictData.yoy_pct)?.color
                              }`}
                            >
                              {formatYoY(hoveredDistrictData.yoy_pct)?.text}
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 md:gap-3">
          {Object.entries(PSF_COLOR_SCALE).map(([key, { color, label }]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 md:w-4 md:h-4 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] md:text-xs text-[#547792]">
                {label}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 md:w-4 md:h-4 rounded bg-gray-200 opacity-50" />
            <span className="text-[10px] md:text-xs text-[#547792]">
              No data
            </span>
          </div>
        </div>
      </div>

      {/* Bedroom Filter Bar (Glass-morphic) */}
      <div className="px-4 py-3 md:px-6 md:py-4 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/20">
        <div className="flex items-center justify-center gap-1 md:gap-2">
          <span className="text-xs text-[#547792] mr-2 hidden sm:inline">
            Filter by:
          </span>
          <div
            className="
            inline-flex items-center gap-0.5 md:gap-1
            p-1 rounded-lg
            bg-white/60 backdrop-blur-sm
            border border-[#94B4C1]/30
            shadow-sm
          "
          >
            {BEDROOM_OPTIONS.map((option) => (
              <motion.button
                key={option.value}
                onClick={() => setSelectedBed(option.value)}
                whileTap={{ scale: 0.95 }}
                className={`
                  min-h-[36px] md:min-h-[40px]
                  px-3 md:px-4 py-1.5 md:py-2
                  text-xs md:text-sm font-medium
                  rounded-md
                  transition-all duration-200
                  touch-action-manipulation
                  ${
                    selectedBed === option.value
                      ? 'bg-[#547792] text-white shadow-md'
                      : 'bg-transparent text-[#547792] hover:bg-[#EAE0CF]/50'
                  }
                `}
              >
                {option.label}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      {!loading && !error && districtData.length > 0 && (
        <div className="px-4 py-3 md:px-6 md:py-4 bg-[#EAE0CF]/10 border-t border-[#94B4C1]/20">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-[#547792] uppercase tracking-wide">
                Lowest PSF
              </p>
              <p className="text-sm md:text-base font-semibold text-[#213448] font-mono">
                {formatPsf(psfRange.min)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#547792] uppercase tracking-wide">
                Districts
              </p>
              <p className="text-sm md:text-base font-semibold text-[#213448] font-mono">
                {districtData.filter((d) => d.has_data).length} / 28
              </p>
            </div>
            <div>
              <p className="text-xs text-[#547792] uppercase tracking-wide">
                Highest PSF
              </p>
              <p className="text-sm md:text-base font-semibold text-[#213448] font-mono">
                {formatPsf(psfRange.max)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
