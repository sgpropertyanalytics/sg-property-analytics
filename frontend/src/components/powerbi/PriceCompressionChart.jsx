import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import { getAggregate } from '../../api/client';
import { DrillButtons } from './DrillButtons';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  annotationPlugin
);

// Constants for local drill
const LOCAL_TIME_LEVELS = ['year', 'quarter', 'month'];
const LOCAL_TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

/**
 * Price Compression Analysis Chart
 *
 * Shows the spread between market segments (CCR-RCR and RCR-OCR) over time.
 * - Compression (narrowing spreads) = suburban catching up, broad market strength
 * - Expansion (widening spreads) = flight to quality, premium outperformance
 *
 * Features:
 * - Compression Score (0-100): 100 = tight (at historical min), 0 = wide (at historical max)
 * - UI Chips: Current spread values with period-over-period change
 * - Auto-annotations: Breakout (>10% from 6M baseline) and Reversion (within 5% of median)
 * - Sparkline: Mini trend of combined spread
 * - Local drill: Year → Quarter → Month (visual-local only)
 *
 * RESPECTS GLOBAL SIDEBAR FILTERS (district, bedroom, segment, date range).
 * Uses excludeHighlight: true (time-series chart pattern).
 */
export function PriceCompressionChart({ height = 380 }) {
  // Get GLOBAL filters from context
  const { buildApiParams, filters, highlight, applyHighlight } = usePowerBIFilters();

  // LOCAL drill state - year → quarter → month (visual-local only)
  const [localDrillLevel, setLocalDrillLevel] = useState('quarter');

  // Data state
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [showContext, setShowContext] = useState(false);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Fetch data when filters or drill level change
  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad.current) {
        setLoading(true);
      } else {
        setUpdating(true);
      }
      setError(null);

      try {
        // Use LOCAL drill level, excludeHighlight for time-series pattern
        const params = buildApiParams({
          group_by: `${localDrillLevel},region`,
          metrics: 'median_psf,count'
        }, { excludeHighlight: true });

        const response = await getAggregate(params);
        const rawData = response.data.data || [];
        const transformed = transformData(rawData, localDrillLevel);
        setData(transformed);
        isInitialLoad.current = false;
      } catch (err) {
        console.error('Error fetching compression data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setUpdating(false);
      }
    };
    fetchData();
  }, [buildApiParams, localDrillLevel, filters]);

  // Transform raw API data into spread-friendly format
  const transformData = (rawData, timeGrain) => {
    // Group by time period
    const grouped = {};
    rawData.forEach(row => {
      const period = row[timeGrain];
      if (!grouped[period]) grouped[period] = { CCR: null, RCR: null, OCR: null, counts: {} };
      const region = row.region?.toUpperCase();
      if (region) {
        grouped[period][region] = row.median_psf;
        grouped[period].counts[region] = row.count || 0;
      }
    });

    // Sort chronologically and calculate spreads
    const sorted = Object.entries(grouped)
      .sort(([a], [b]) => String(a).localeCompare(String(b)));

    return sorted.map(([period, values], idx) => {
      const ccrRcrSpread = values.CCR && values.RCR ? Math.round(values.CCR - values.RCR) : null;
      const rcrOcrSpread = values.RCR && values.OCR ? Math.round(values.RCR - values.OCR) : null;
      const combinedSpread = (ccrRcrSpread || 0) + (rcrOcrSpread || 0);

      // Calculate period-over-period change
      let ccrRcrChange = 0;
      let rcrOcrChange = 0;
      if (idx > 0) {
        const prev = sorted[idx - 1][1];
        const prevCcrRcr = prev.CCR && prev.RCR ? prev.CCR - prev.RCR : null;
        const prevRcrOcr = prev.RCR && prev.OCR ? prev.RCR - prev.OCR : null;
        if (ccrRcrSpread !== null && prevCcrRcr !== null) {
          ccrRcrChange = Math.round(ccrRcrSpread - prevCcrRcr);
        }
        if (rcrOcrSpread !== null && prevRcrOcr !== null) {
          rcrOcrChange = Math.round(rcrOcrSpread - prevRcrOcr);
        }
      }

      return {
        period,
        ccr: values.CCR,
        rcr: values.RCR,
        ocr: values.OCR,
        ccrRcrSpread,
        rcrOcrSpread,
        combinedSpread,
        ccrRcrChange,
        rcrOcrChange,
        counts: values.counts,
      };
    });
  };

  // LOCAL drill handlers
  const currentDrillIndex = LOCAL_TIME_LEVELS.indexOf(localDrillLevel);

  const handleLocalDrillUp = () => {
    if (currentDrillIndex > 0) {
      setLocalDrillLevel(LOCAL_TIME_LEVELS[currentDrillIndex - 1]);
    }
  };

  const handleLocalDrillDown = () => {
    if (currentDrillIndex < LOCAL_TIME_LEVELS.length - 1) {
      setLocalDrillLevel(LOCAL_TIME_LEVELS[currentDrillIndex + 1]);
    }
  };

  // Click handler for highlight
  const handleChartClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const period = data[index]?.period;
      if (period) {
        applyHighlight('time', localDrillLevel, period);
      }
    }
  };

  // Computed values
  const compressionScore = useMemo(() => calculateCompressionScore(data), [data]);
  const marketSignals = useMemo(() => detectMarketSignals(data), [data]);
  const inversionZones = useMemo(() => detectInversionZones(data), [data]);
  const averageSpreads = useMemo(() => calculateAverageSpreads(data), [data]);
  const latestData = data[data.length - 1] || {};
  const sparklineData = data.map(d => d.combinedSpread).filter(v => v != null);

  // Highlighted index for visual emphasis
  const highlightedIndex = useMemo(() => {
    if (highlight.source === 'time' && highlight.value) {
      return data.findIndex(d => String(d.period) === String(highlight.value));
    }
    return -1;
  }, [highlight, data]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-[#547792]">Loading compression data...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  // Chart data for spread lines
  const spreadChartData = {
    labels: data.map(d => d.period),
    datasets: [
      {
        label: 'CCR-RCR Spread',
        data: data.map(d => d.ccrRcrSpread),
        borderColor: '#213448',
        backgroundColor: 'rgba(33, 52, 72, 0.15)',
        borderWidth: 2,
        pointRadius: data.map((_, i) => highlightedIndex === i ? 6 : 3),
        pointBackgroundColor: data.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? '#213448'
            : 'rgba(33, 52, 72, 0.4)'
        ),
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        fill: true,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'RCR-OCR Spread',
        data: data.map(d => d.rcrOcrSpread),
        borderColor: '#547792',
        backgroundColor: 'rgba(84, 119, 146, 0.15)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: data.map((_, i) => highlightedIndex === i ? 6 : 3),
        pointBackgroundColor: data.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? '#547792'
            : 'rgba(84, 119, 146, 0.4)'
        ),
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        fill: true,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  };

  // Chart options with annotations
  const spreadChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    onClick: handleChartClick,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: { size: 11 },
          generateLabels: (chart) => {
            return [
              {
                text: 'CCR ↔ RCR Spread (solid)',
                fillStyle: '#213448',
                strokeStyle: '#213448',
                lineWidth: 2,
                pointStyle: 'line',
                hidden: false,
                datasetIndex: 0,
              },
              {
                text: 'RCR ↔ OCR Spread (dashed)',
                fillStyle: '#547792',
                strokeStyle: '#547792',
                lineWidth: 2,
                lineDash: [5, 5],
                pointStyle: 'line',
                hidden: false,
                datasetIndex: 1,
              },
            ];
          },
        },
      },
      tooltip: {
        callbacks: {
          title: (items) => `${items[0].label}`,
          label: (context) => {
            const idx = context.dataIndex;
            const d = data[idx];
            if (!d) return '';
            if (context.datasetIndex === 0) {
              return `CCR-RCR: $${d.ccrRcrSpread?.toLocaleString() || '-'} PSF`;
            }
            return `RCR-OCR: $${d.rcrOcrSpread?.toLocaleString() || '-'} PSF`;
          },
          afterBody: (items) => {
            const idx = items[0]?.dataIndex;
            if (idx !== undefined && data[idx]) {
              const d = data[idx];
              const lines = [];
              if (d.ccr) lines.push(`CCR: $${Math.round(d.ccr).toLocaleString()} PSF (${d.counts?.CCR || 0} transactions)`);
              if (d.rcr) lines.push(`RCR: $${Math.round(d.rcr).toLocaleString()} PSF (${d.counts?.RCR || 0} transactions)`);
              if (d.ocr) lines.push(`OCR: $${Math.round(d.ocr).toLocaleString()} PSF (${d.counts?.OCR || 0} transactions)`);
              return lines;
            }
            return [];
          },
        },
      },
      annotation: {
        annotations: buildInversionZones(inversionZones, data),
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          font: { size: 10 },
        },
      },
      y: {
        title: { display: true, text: 'Spread ($/PSF)', font: { size: 11 } },
        ticks: {
          callback: (v) => `$${v.toLocaleString()}`,
          font: { size: 10 },
        },
        grid: { color: 'rgba(148, 180, 193, 0.2)' },
      },
    },
  };

  // Context chart data (absolute PSF values)
  const contextChartData = {
    labels: data.map(d => d.period),
    datasets: [
      {
        label: 'CCR (Core Central)',
        data: data.map(d => d.ccr),
        borderColor: '#213448',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'RCR (Rest of Central)',
        data: data.map(d => d.rcr),
        borderColor: '#547792',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'OCR (Outside Central)',
        data: data.map(d => d.ocr),
        borderColor: '#94B4C1',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  };

  const contextChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, padding: 10, font: { size: 10 } },
      },
      tooltip: { enabled: false },
    },
    scales: {
      x: { display: false },
      y: {
        ticks: { callback: (v) => `$${v.toLocaleString()}`, font: { size: 9 } },
        grid: { color: 'rgba(148, 180, 193, 0.1)' },
      },
    },
  };

  return (
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#213448] text-sm md:text-base">
                Market Compression Analysis
              </h3>
              {updating && (
                <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-[#547792] mt-0.5">
              Spread widening = fragmentation; spread narrowing = compression
            </p>
          </div>
          <DrillButtons
            localLevel={localDrillLevel}
            localLevels={LOCAL_TIME_LEVELS}
            localLevelLabels={LOCAL_TIME_LABELS}
            onLocalDrillUp={handleLocalDrillUp}
            onLocalDrillDown={handleLocalDrillDown}
          />
        </div>

        {/* KPI Row: Compression Score + Market Signals */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {/* Compression Score Box */}
          <div className="bg-[#213448]/5 rounded-lg px-3 py-2 text-center min-w-[90px]">
            <div className="text-xl md:text-2xl font-bold text-[#213448]">{compressionScore.score}</div>
            <div className="text-[10px] md:text-xs text-[#547792]">Compression ({compressionScore.label})</div>
            <Sparkline data={sparklineData} width={70} height={16} />
          </div>

          {/* Smart Market Signal Cards */}
          <div className="flex flex-wrap gap-2">
            <MarketSignalCard
              type="ccr-rcr"
              spread={latestData.ccrRcrSpread}
              avgSpread={averageSpreads.ccrRcr}
              isInverted={marketSignals.ccrDiscount}
            />
            <MarketSignalCard
              type="rcr-ocr"
              spread={latestData.rcrOcrSpread}
              avgSpread={averageSpreads.rcrOcr}
              isInverted={marketSignals.ocrOverheated}
            />
          </div>
        </div>
      </div>

      {/* Main Spread Chart */}
      <div className="p-2 md:p-3 lg:p-4" style={{ height: showContext ? height * 0.65 : height }}>
        {data.length > 0 ? (
          <Line key={localDrillLevel} ref={chartRef} data={spreadChartData} options={spreadChartOptions} />
        ) : (
          <div className="flex items-center justify-center h-full text-[#547792]">
            <div className="text-center">
              <p className="text-sm">No data available for selected filters</p>
            </div>
          </div>
        )}
      </div>

      {/* Context Panel (Collapsible) */}
      {showContext && data.length > 0 && (
        <div className="px-3 pb-3 md:px-4 md:pb-4" style={{ height: height * 0.25 }}>
          <div className="text-xs text-[#547792] mb-1 font-medium">Absolute PSF Context</div>
          <Line data={contextChartData} options={contextChartOptions} />
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-2 md:px-4 md:py-2 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex justify-between items-center">
        <button
          onClick={() => setShowContext(!showContext)}
          className="text-xs text-[#547792] hover:text-[#213448] transition-colors"
        >
          {showContext ? '▲ Hide' : '▼ Show'} absolute PSF
        </button>
        <span className="text-xs text-[#547792]">
          {data.length} periods | Click to highlight
        </span>
      </div>
    </div>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate Compression Score (0-100)
 * 100 = spreads at historical minimum (tight)
 * 0 = spreads at historical maximum (wide)
 */
function calculateCompressionScore(data) {
  if (data.length < 2) return { score: 50, label: 'moderate' };

  const spreads = data.map(d => d.combinedSpread).filter(v => v != null && v > 0);
  if (spreads.length < 2) return { score: 50, label: 'moderate' };

  const current = spreads[spreads.length - 1];
  const minSpread = Math.min(...spreads);
  const maxSpread = Math.max(...spreads);

  if (maxSpread === minSpread) return { score: 50, label: 'moderate' };

  // Score: 100 = at min (tight), 0 = at max (wide)
  const score = Math.round(100 - ((current - minSpread) / (maxSpread - minSpread)) * 100);
  const clampedScore = Math.max(0, Math.min(100, score));

  let label = 'moderate';
  if (clampedScore >= 70) label = 'tight';
  else if (clampedScore <= 30) label = 'wide';

  return { score: clampedScore, label };
}

/**
 * Calculate average spreads from the filtered data
 */
function calculateAverageSpreads(data) {
  if (data.length === 0) return { ccrRcr: null, rcrOcr: null };

  const ccrRcrSpreads = data.map(d => d.ccrRcrSpread).filter(v => v != null);
  const rcrOcrSpreads = data.map(d => d.rcrOcrSpread).filter(v => v != null);

  const avgCcrRcr = ccrRcrSpreads.length > 0
    ? Math.round(ccrRcrSpreads.reduce((a, b) => a + b, 0) / ccrRcrSpreads.length)
    : null;

  const avgRcrOcr = rcrOcrSpreads.length > 0
    ? Math.round(rcrOcrSpreads.reduce((a, b) => a + b, 0) / rcrOcrSpreads.length)
    : null;

  return { ccrRcr: avgCcrRcr, rcrOcr: avgRcrOcr };
}

/**
 * Detect market signal anomalies (inversions)
 * - CCR Discount: When CCR < RCR (negative spread) - opportunity signal
 * - OCR Overheated: When OCR > RCR (negative spread) - risk signal
 */
function detectMarketSignals(data) {
  if (data.length === 0) return { ccrDiscount: false, ocrOverheated: false };

  const latest = data[data.length - 1];
  return {
    ccrDiscount: latest.ccrRcrSpread !== null && latest.ccrRcrSpread < 0,
    ocrOverheated: latest.rcrOcrSpread !== null && latest.rcrOcrSpread < 0,
  };
}

/**
 * Detect historical inversion zones for chart background
 * Returns arrays of period ranges where inversions occurred
 */
function detectInversionZones(data) {
  const ccrDiscountZones = [];
  const ocrOverheatedZones = [];

  let ccrStart = null;
  let ocrStart = null;

  data.forEach((d, idx) => {
    // CCR < RCR detection
    if (d.ccrRcrSpread !== null && d.ccrRcrSpread < 0) {
      if (ccrStart === null) ccrStart = idx;
    } else {
      if (ccrStart !== null) {
        ccrDiscountZones.push({ start: ccrStart, end: idx - 1 });
        ccrStart = null;
      }
    }

    // OCR > RCR detection
    if (d.rcrOcrSpread !== null && d.rcrOcrSpread < 0) {
      if (ocrStart === null) ocrStart = idx;
    } else {
      if (ocrStart !== null) {
        ocrOverheatedZones.push({ start: ocrStart, end: idx - 1 });
        ocrStart = null;
      }
    }
  });

  // Close any open zones at the end
  if (ccrStart !== null) {
    ccrDiscountZones.push({ start: ccrStart, end: data.length - 1 });
  }
  if (ocrStart !== null) {
    ocrOverheatedZones.push({ start: ocrStart, end: data.length - 1 });
  }

  return { ccrDiscountZones, ocrOverheatedZones };
}

/**
 * Build Chart.js annotation boxes for inversion zones
 */
function buildInversionZones(zones, data) {
  const result = {};

  // CCR Discount zones (green/amber background)
  zones.ccrDiscountZones?.forEach((zone, idx) => {
    result[`ccr_discount_${idx}`] = {
      type: 'box',
      xMin: zone.start - 0.5,
      xMax: zone.end + 0.5,
      backgroundColor: 'rgba(251, 191, 36, 0.15)', // amber-400 with low opacity
      borderColor: 'rgba(251, 191, 36, 0.4)',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        content: 'Prime Discount',
        display: zone.end - zone.start >= 1, // Only show label if zone spans 2+ periods
        position: 'start',
        color: 'rgba(180, 83, 9, 0.8)',
        font: { size: 9, weight: 'bold' },
      },
    };
  });

  // OCR Overheated zones (red background)
  zones.ocrOverheatedZones?.forEach((zone, idx) => {
    result[`ocr_overheated_${idx}`] = {
      type: 'box',
      xMin: zone.start - 0.5,
      xMax: zone.end + 0.5,
      backgroundColor: 'rgba(239, 68, 68, 0.12)', // red-500 with low opacity
      borderColor: 'rgba(239, 68, 68, 0.3)',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        content: 'OCR Overheated',
        display: zone.end - zone.start >= 1,
        position: 'start',
        color: 'rgba(185, 28, 28, 0.8)',
        font: { size: 9, weight: 'bold' },
      },
    };
  });

  return result;
}

// ============================================
// SUB-COMPONENTS
// ============================================

/**
 * Mini sparkline for compression trend
 */
function Sparkline({ data, width = 70, height = 16 }) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="mx-auto mt-1">
      <polyline
        points={points}
        fill="none"
        stroke="#547792"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Smart Market Signal Card
 * Consistent height with compression score card
 * Shows + sign, value, and % vs average
 */
function MarketSignalCard({ type, spread, avgSpread, isInverted }) {
  if (spread == null) return null;

  // Calculate % difference from average
  const pctVsAvg = avgSpread && avgSpread !== 0
    ? Math.round(((spread - avgSpread) / Math.abs(avgSpread)) * 100)
    : null;

  const labels = {
    'ccr-rcr': 'Prime Premium (CCR vs RCR)',
    'rcr-ocr': 'Fringe Premium (RCR vs OCR)',
  };

  // Inverted states (anomalies)
  if (isInverted) {
    if (type === 'ccr-rcr') {
      // CCR < RCR: Prime Discount (opportunity)
      return (
        <div className="bg-amber-100 border-2 border-amber-400 rounded-lg px-3 py-2 text-center min-w-[140px]">
          <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
            Market Anomaly
          </div>
          <div className="text-lg md:text-xl font-bold text-amber-900">
            −${Math.abs(spread).toLocaleString()} PSF
          </div>
          <div className="text-[10px] text-amber-700 font-semibold">
            Prime Discount
          </div>
        </div>
      );
    }
    if (type === 'rcr-ocr') {
      // OCR > RCR: Risk Alert
      return (
        <div className="bg-red-50 border-2 border-red-500 rounded-lg px-3 py-2 text-center min-w-[140px]">
          <div className="text-[10px] font-bold text-red-800 uppercase tracking-wider">
            Risk Alert
          </div>
          <div className="text-lg md:text-xl font-bold text-red-900">
            −${Math.abs(spread).toLocaleString()} PSF
          </div>
          <div className="text-[10px] text-red-700 font-semibold">
            OCR Overheated
          </div>
        </div>
      );
    }
  }

  // Normal state - consistent card design
  const isAboveAvg = pctVsAvg !== null && pctVsAvg > 0;
  const isBelowAvg = pctVsAvg !== null && pctVsAvg < 0;

  return (
    <div className="bg-[#213448]/5 rounded-lg px-3 py-2 text-center min-w-[140px]">
      <div className="text-[10px] text-[#547792] uppercase tracking-wide">
        {labels[type]}
      </div>
      <div className="text-lg md:text-xl font-bold text-[#213448]">
        +${spread.toLocaleString()} PSF
      </div>
      {pctVsAvg !== null && (
        <div className={`text-[10px] font-medium ${
          isBelowAvg ? 'text-emerald-600' : isAboveAvg ? 'text-red-600' : 'text-[#547792]'
        }`}>
          {isBelowAvg ? `${pctVsAvg}% below avg` : isAboveAvg ? `+${pctVsAvg}% above avg` : 'At average'}
        </div>
      )}
    </div>
  );
}

export default PriceCompressionChart;
