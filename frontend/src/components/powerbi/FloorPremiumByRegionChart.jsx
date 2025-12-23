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
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import {
  FLOOR_LEVELS,
  FLOOR_LEVEL_LABELS_SHORT,
  getFloorLevelIndex,
} from '../../constants';
import { KeyInsightBox } from '../ui/KeyInsightBox';

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
    borderDash: [],
  },
  RCR: {
    label: 'RCR (Rest of Central)',
    color: 'rgba(84, 119, 146, 1)',      // Ocean Blue
    bgColor: 'rgba(84, 119, 146, 0.1)',
    borderDash: [],
  },
  OCR: {
    label: 'OCR (Outside Central)',
    color: 'rgba(90, 130, 150, 1)',      // Darker Sky Blue for visibility
    bgColor: 'rgba(90, 130, 150, 0.15)',
    borderDash: [5, 3],                   // Dashed pattern for distinction
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
  const { buildApiParams, filters } = usePowerBIFilters();
  const [regionData, setRegionData] = useState({ CCR: [], RCR: [], OCR: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);

  // Fetch data for all regions
  useEffect(() => {
    const fetchAllRegions = async () => {
      setLoading(true);
      setError(null);

      try {
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

            const response = await getAggregate(params);
            const rawData = response.data.data || [];

            // Sort and filter
            results[region] = rawData
              .filter(d => d.floor_level && d.floor_level !== 'Unknown')
              .sort((a, b) => getFloorLevelIndex(a.floor_level) - getFloorLevelIndex(b.floor_level));
          })
        );

        setRegionData(results);
      } catch (err) {
        console.error('Error fetching region data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAllRegions();
  }, [buildApiParams, filters, bedroom]);

  // Calculate premiums for each region
  const premiumsByRegion = useMemo(() => {
    const result = {};

    Object.keys(regionData).forEach(region => {
      const data = regionData[region];
      const lowFloor = data.find(d => d.floor_level === 'Low');
      const baselinePSF = lowFloor?.median_psf_actual || lowFloor?.avg_psf || 0;

      if (baselinePSF === 0) {
        result[region] = { premiums: [], counts: [], psfs: [] };
        return;
      }

      const premiums = {};
      const counts = {};
      const psfs = {};

      data.forEach(d => {
        const psf = d.median_psf_actual || d.avg_psf || 0;
        const premium = ((psf - baselinePSF) / baselinePSF) * 100;
        premiums[d.floor_level] = premium;
        counts[d.floor_level] = d.count || 0;
        psfs[d.floor_level] = psf;
      });

      result[region] = { premiums, counts, psfs, baselinePSF };
    });

    return result;
  }, [regionData]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#547792]">Loading region comparison...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  // Check if we have any data
  const hasData = Object.values(regionData).some(d => d.length > 0);
  if (!hasData) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6" style={{ minHeight: height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-[#547792]">No floor level data available</div>
        </div>
      </div>
    );
  }

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
      borderDash: config.borderDash || [],
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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
            return `${floorLevels[index]} Floor`;
          },
          label: (context) => {
            const region = Object.keys(REGION_CONFIG)[context.datasetIndex];
            const premium = context.parsed.y;
            const data = premiumsByRegion[region];
            const floorLevel = floorLevels[context.dataIndex];
            const count = data?.counts?.[floorLevel] || 0;
            const psf = data?.psfs?.[floorLevel] || 0;

            if (premium === null) return `${context.dataset.label}: No data`;

            return [
              `${context.dataset.label}`,
              `  Premium: ${premium >= 0 ? '+' : ''}${premium.toFixed(1)}%`,
              `  PSF: $${Math.round(psf).toLocaleString()}`,
              `  Transactions: ${count}`,
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
  };

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
    <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <h3 className="font-semibold text-[#213448]">Floor Premium by Market Segment</h3>
        <p className="text-xs text-[#547792] mt-0.5">
          How floor premiums vary across CCR, RCR, and OCR
        </p>
      </div>

      {/* Key Insight */}
      <KeyInsightBox title="Key Takeaway" variant="info">
        <span className="font-semibold text-[#213448]">CCR properties</span> typically have the{' '}
        <span className="font-semibold text-[#213448]">steepest floor premiums</span> -
        higher floors command significantly more in premium areas.{' '}
        <span className="font-semibold text-[#213448]">OCR</span> (suburban) shows the flattest curve.
      </KeyInsightBox>

      {/* Chart */}
      <div className="p-4" style={{ height: height - 100 }}>
        <Chart ref={chartRef} type="line" data={chartData} options={options} />
      </div>

      {/* Footer - Mini cards */}
      <div className="px-4 py-3 bg-[#EAE0CF]/20 border-t border-[#94B4C1]/30">
        <span className="text-xs text-[#94B4C1] block mb-2">Peak Premium by Segment</span>
        <div className="grid grid-cols-3 gap-2">
          {[
            { region: 'CCR', max: ccrMax },
            { region: 'RCR', max: rcrMax },
            { region: 'OCR', max: ocrMax },
          ].map(({ region, max }) => {
            const isLowSample = max.count < 20;
            return (
              <div
                key={region}
                className={`px-2 py-1.5 rounded border ${
                  isLowSample ? 'bg-gray-50 border-gray-200' : 'bg-white border-[#94B4C1]/30'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: REGION_CONFIG[region].color }}
                  />
                  <span className="text-xs font-semibold text-[#213448]">{region}</span>
                </div>
                <div className="text-sm font-bold text-[#213448]">
                  {max.tier}{' '}
                  <span className="text-green-600">+{max.value.toFixed(0)}%</span>
                </div>
                {isLowSample && (
                  <div className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Only {max.count} sales
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default FloorPremiumByRegionChart;
