import React, { useRef, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
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
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import {
  FLOOR_LEVELS,
  FLOOR_LEVEL_LABELS_SHORT,
  getFloorLevelIndex,
} from '../../constants';
import { getAggField, AggField, isFloorLevel } from '../../schemas/apiContract';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Region colors matching the app palette
const REGION_CONFIG = {
  CCR: {
    label: 'CCR (Core Central)',
    color: 'rgba(33, 52, 72, 1)',        // Deep Navy
    bgColor: 'rgba(33, 52, 72, 0.1)',
  },
  RCR: {
    label: 'RCR (Rest of Central)',
    color: 'rgba(84, 119, 146, 1)',      // Ocean Blue
    bgColor: 'rgba(84, 119, 146, 0.1)',
  },
  OCR: {
    label: 'OCR (Outside Central)',
    color: 'rgba(148, 180, 193, 1)',     // Sky Blue
    bgColor: 'rgba(148, 180, 193, 0.1)',
  },
};

/**
 * Floor Premium by Region Chart
 *
 * Shows floor premium curves for CCR, RCR, and OCR side-by-side
 * to compare how floor premiums vary across market segments.
 *
 * X-axis: Floor level tier
 * Y-axis: Premium % vs Low floor baseline
 * Lines: CCR (dark), RCR (medium), OCR (light)
 */
export function FloorPremiumByRegionChart({ height = 300, bedroom }) {
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();
  const chartRef = useRef(null);

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data: regionData, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const regions = ['CCR', 'RCR', 'OCR'];
      const results = {};

      // Fetch all regions in parallel
      await Promise.all(
        regions.map(async (region) => {
          const params = buildApiParams({
            group_by: 'floor_level',
            metrics: 'count,median_psf_actual,avg_psf'
          });
          params.segment = region;
          if (bedroom) params.bedroom = bedroom;

          const response = await getAggregate(params, { signal });
          const rawData = response.data.data || [];

          // Sort and filter (use getAggField for v1/v2 compatibility)
          results[region] = rawData
            .filter(d => {
              const floorLevel = getAggField(d, AggField.FLOOR_LEVEL);
              return floorLevel && !isFloorLevel.unknown(floorLevel);
            })
            .sort((a, b) => {
              const aLevel = getAggField(a, AggField.FLOOR_LEVEL);
              const bLevel = getAggField(b, AggField.FLOOR_LEVEL);
              return getFloorLevelIndex(aLevel) - getFloorLevelIndex(bLevel);
            });
        })
      );

      return results;
    },
    [debouncedFilterKey, bedroom],
    { initialData: { CCR: [], RCR: [], OCR: [] } }
  );

  // Calculate premiums for each region (use getAggField for v1/v2 compatibility)
  const premiumsByRegion = useMemo(() => {
    const result = {};

    Object.keys(regionData).forEach(region => {
      const data = regionData[region];
      const lowFloor = data.find(d => getAggField(d, AggField.FLOOR_LEVEL) === 'Low');
      const baselinePSF = lowFloor
        ? (getAggField(lowFloor, AggField.MEDIAN_PSF) || getAggField(lowFloor, AggField.AVG_PSF) || 0)
        : 0;

      if (baselinePSF === 0) {
        result[region] = { premiums: [], counts: [], psfs: [] };
        return;
      }

      const premiums = {};
      const counts = {};
      const psfs = {};

      data.forEach(d => {
        const floorLevel = getAggField(d, AggField.FLOOR_LEVEL);
        const psf = getAggField(d, AggField.MEDIAN_PSF) || getAggField(d, AggField.AVG_PSF) || 0;
        const premium = ((psf - baselinePSF) / baselinePSF) * 100;
        premiums[floorLevel] = premium;
        counts[floorLevel] = getAggField(d, AggField.COUNT) || 0;
        psfs[floorLevel] = psf;
      });

      result[region] = { premiums, counts, psfs, baselinePSF };
    });

    return result;
  }, [regionData]);

  // Chart options - memoized (must be before early returns per React hooks rules)
  const options = useMemo(() => ({
    ...baseChartJsOptions,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: { size: 11, weight: 'bold' },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        titleColor: '#EAE0CF',
        bodyColor: '#EAE0CF',
        padding: 12,
        displayColors: true,
        callbacks: {
          title: (items) => {
            const index = items[0]?.dataIndex;
            return `${FLOOR_LEVELS[index]} Floor`;
          },
          label: (context) => {
            const region = Object.keys(REGION_CONFIG)[context.datasetIndex];
            const premium = context.parsed.y;
            const data = premiumsByRegion[region];
            const floorLevel = FLOOR_LEVELS[context.dataIndex];
            const count = data?.counts?.[floorLevel] || 0;
            const psf = data?.psfs?.[floorLevel] || 0;

            if (premium === null) return `${context.dataset.label}: No data`;

            return [
              `${context.dataset.label}`,
              `  Premium: ${premium >= 0 ? '+' : ''}${premium.toFixed(1)}%`,
              `  PSF: $${Math.round(psf).toLocaleString()}`,
              `  Observations: ${count}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#547792',
          font: { size: 11, weight: 'bold' },
        },
      },
      y: {
        grid: { color: 'rgba(148, 180, 193, 0.2)' },
        ticks: {
          color: '#213448',
          callback: (v) => `${v >= 0 ? '+' : ''}${v}%`,
        },
        title: {
          display: true,
          text: 'Premium vs Low Floor (%)',
          color: '#213448',
          font: { size: 12, weight: 'bold' },
        },
      },
    },
  }), [premiumsByRegion]);

  // Card height for consistent alignment with FloorPremiumTrendChart
  const cardHeight = height + 80;

  // Check if we have any data
  const hasData = Object.values(regionData).some(d => d.length > 0);

  // Use standard floor levels for x-axis
  const floorLevels = FLOOR_LEVELS;
  const labels = floorLevels.map(fl => FLOOR_LEVEL_LABELS_SHORT[fl] || fl);

  // Build datasets
  const datasets = Object.entries(REGION_CONFIG).map(([region, config]) => {
    const data = premiumsByRegion[region];
    const premiumValues = floorLevels.map(fl => data?.premiums?.[fl] ?? null);
    const countValues = floorLevels.map(fl => data?.counts?.[fl] ?? 0);

    // Determine point sizes based on transaction count
    const pointRadii = countValues.map(count => {
      if (count >= 10) return 6;
      if (count >= 5) return 4;
      return 2;
    });

    return {
      label: config.label,
      data: premiumValues,
      borderColor: config.color,
      backgroundColor: config.bgColor,
      borderWidth: 3,
      pointRadius: pointRadii,
      pointBackgroundColor: config.color,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointHoverRadius: 8,
      tension: 0.2,
      spanGaps: true, // Connect points even with null values
    };
  });

  const chartData = { labels, datasets };

  // Calculate insights with transaction counts for transparency
  const getMaxPremium = (region) => {
    const data = premiumsByRegion[region];
    if (!data?.premiums) return { tier: '-', value: 0, count: 0 };
    const entries = Object.entries(data.premiums);
    if (entries.length === 0) return { tier: '-', value: 0, count: 0 };
    const max = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const count = data.counts?.[max[0]] || 0;
    return { tier: max[0], value: max[1], count };
  };

  const ccrMax = getMaxPremium('CCR');
  const rcrMax = getMaxPremium('RCR');
  const ocrMax = getMaxPremium('OCR');

  // Helper to format premium with warning for low sample
  const formatPremium = (max) => {
    const isLowSample = max.count < 20;
    return `${max.tier} +${max.value.toFixed(1)}%${isLowSample ? ` (n=${max.count})` : ''}`;
  };

  return (
    <QueryState loading={loading} error={error} onRetry={refetch} empty={!hasData}>
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden flex flex-col" style={{ height: cardHeight }}>
        {/* Header - shrink-0 */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="font-semibold text-[#213448]">Floor Premium by Market Segment</h3>
          <p className="text-xs text-[#547792] mt-0.5">
            Compare how floor premiums vary across market segments
          </p>
        </div>

        {/* Chart slot - flex-1 min-h-0 overflow-hidden */}
        <ChartSlot>
          <PreviewChartOverlay chartRef={chartRef}>
            <Chart ref={chartRef} type="line" data={chartData} options={options} />
          </PreviewChartOverlay>
        </ChartSlot>

        {/* Footer - wraps on mobile */}
        <div className="shrink-0 min-h-[44px] px-4 py-2 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="shrink-0 text-[#547792] font-medium">Peak Premium:</span>
          <div className="shrink-0 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: REGION_CONFIG.CCR.color }} />
            <span className="text-[#213448]">CCR {formatPremium(ccrMax)}</span>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: REGION_CONFIG.RCR.color }} />
            <span className="text-[#213448]">RCR {formatPremium(rcrMax)}</span>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: REGION_CONFIG.OCR.color }} />
            <span className={ocrMax.count < 20 ? "text-[#547792]" : "text-[#213448]"}>OCR {formatPremium(ocrMax)}</span>
          </div>
        </div>
      </div>
    </QueryState>
  );
}

export default FloorPremiumByRegionChart;
