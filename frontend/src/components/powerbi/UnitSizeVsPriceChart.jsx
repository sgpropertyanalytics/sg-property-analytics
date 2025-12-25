import React, { useState, useRef, useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { useSubscription } from '../../context/SubscriptionContext';
import apiClient from '../../api/client';
import { formatPrice, getBedroomLabelShort } from '../../constants';
import { KeyInsightBox, PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';

ChartJS.register(
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

/**
 * Unit Size vs Price Chart - Scatter Plot
 *
 * X-axis: Transaction Price (Total Quantum) - aligns with Price Distribution
 * Y-axis: Unit Size (sqft) - "What you get for your money"
 * Color: Bedroom count (1BR-5BR+)
 *
 * Together with Price Distribution, answers the buyer question:
 * "What's my budget?" (Price Distribution) + "What can I get?" (This chart)
 *
 * Features:
 * - Stable sampling: same filters = same data points (no flickering)
 * - Refresh button: generates new random sample on demand
 * - Sampled data (2000 points) for performance
 * - Color-coded by bedroom type
 * - Opacity handles overplotting
 * - Tooltips show project details
 */
export function UnitSizeVsPriceChart({ height = 350 }) {
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();
  const { isPremium, showPaywall } = useSubscription();
  const [refreshSeed, setRefreshSeed] = useState(null); // null = stable sample, string = new sample
  const chartRef = useRef(null);

  // Handle refresh button click - generates random seed for new sample
  const handleRefresh = () => {
    setRefreshSeed(Math.random().toString(36).substring(2, 10));
  };

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data: apiResponse, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Build params using global filter system
      const baseParams = buildApiParams({});

      // Build request params
      // - Without seed: stable sample (same filters = same data points)
      // - With seed: different sample (triggered by refresh button)
      const requestParams = {
        ...baseParams,
        sample_size: 2000,
      };
      if (refreshSeed) {
        requestParams.seed = refreshSeed;
      }

      // Call the scatter-sample endpoint
      const response = await apiClient.get('/scatter-sample', {
        params: requestParams,
        signal
      });

      return {
        data: response.data.data || [],
        meta: response.data.meta || { sample_size: 0, total_count: 0 }
      };
    },
    [debouncedFilterKey, refreshSeed],
    { initialData: { data: [], meta: { sample_size: 0, total_count: 0 } } }
  );

  // Extract data and meta from response
  const data = apiResponse?.data || [];
  const meta = apiResponse?.meta || { sample_size: 0, total_count: 0 };

  // Bedroom colors - consistent palette across charts
  const bedroomColors = {
    1: 'rgba(247, 190, 129, 0.7)', // Light orange
    2: 'rgba(79, 129, 189, 0.7)',  // Blue
    3: 'rgba(40, 82, 122, 0.7)',   // Dark blue
    4: 'rgba(17, 43, 60, 0.7)',    // Darkest navy
    5: 'rgba(155, 187, 89, 0.7)',  // Green
  };

  const bedroomBorderColors = {
    1: 'rgba(247, 190, 129, 1)',
    2: 'rgba(79, 129, 189, 1)',
    3: 'rgba(40, 82, 122, 1)',
    4: 'rgba(17, 43, 60, 1)',
    5: 'rgba(155, 187, 89, 1)',
  };

  // Transform data for Chart.js - group by bedroom
  const chartData = useMemo(() => {
    // Group points by bedroom count
    const groupedByBedroom = {};
    data.forEach(point => {
      const bedroom = Math.min(point.bedroom, 5); // Cap at 5+
      if (!groupedByBedroom[bedroom]) {
        groupedByBedroom[bedroom] = [];
      }
      groupedByBedroom[bedroom].push({
        x: point.price,
        y: point.area_sqft,
        district: point.district,
        bedroom: point.bedroom,
      });
    });

    // Create datasets for each bedroom type
    const datasets = Object.entries(groupedByBedroom)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([bedroom, points]) => ({
        label: getBedroomLabelShort(bedroom),
        data: points,
        backgroundColor: bedroomColors[bedroom] || 'rgba(128, 128, 128, 0.7)',
        borderColor: bedroomBorderColors[bedroom] || 'rgba(128, 128, 128, 1)',
        borderWidth: 1,
        pointRadius: 4,
        pointHoverRadius: 6,
      }));

    return { datasets };
  }, [data]);

  // Chart options - isPremium determines tooltip detail level
  const options = useMemo(() => ({
    ...baseChartJsOptions,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 12,
          font: { size: 11 },
          color: '#547792',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        titleColor: '#fff',
        bodyColor: '#EAE0CF',
        borderColor: '#94B4C1',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const point = items[0].raw;
            // Both tiers see district + bedroom type
            return `${getBedroomLabelShort(point.bedroom)} Condo · ${point.district}`;
          },
          label: (context) => {
            const point = context.raw;

            // Premium users: Full transaction details
            if (isPremium) {
              return [
                `Price: ${formatPrice(point.x)}`,
                `Size: ${point.y.toLocaleString()} sqft`,
                `PSF: ${formatPrice(point.x / point.y)}/sqft`,
              ];
            }

            // Free users: Generic info with upgrade CTA
            return [
              `Size range: ${Math.round(point.y / 100) * 100}+ sqft`,
              '',
              '🔒 Unlock exact price & PSF',
            ];
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: true,
          text: 'Transaction Price',
          color: '#547792',
          font: { size: 11, weight: 'bold' },
        },
        ticks: {
          color: '#547792',
          font: { size: 10 },
          callback: (value) => formatPrice(value),
          stepSize: 500000, // $0.5M intervals
        },
        grid: {
          color: 'rgba(148, 180, 193, 0.2)',
        },
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: 'Unit Size (sqft)',
          color: '#547792',
          font: { size: 11, weight: 'bold' },
        },
        ticks: {
          color: '#547792',
          font: { size: 10 },
          callback: (value) => value.toLocaleString(),
          maxTicksLimit: 8,
        },
        grid: {
          color: 'rgba(148, 180, 193, 0.2)',
        },
      },
    },
    interaction: {
      mode: 'nearest',
      intersect: true,
    },
    // Free users clicking a point triggers upgrade modal
    onClick: (event, elements) => {
      if (!isPremium && elements.length > 0) {
        showPaywall({ source: 'scatter-tooltip' });
      }
    },
  }), [isPremium, showPaywall]);

  // Card layout contract: flex column with fixed total height
  // Header/Note/Footer are shrink-0, chart slot is flex-1 min-h-0
  // Use same height as PriceDistributionChart for side-by-side alignment
  const cardHeight = height + 190;

  return (
    <QueryState loading={loading} error={error} onRetry={refetch} empty={data.length === 0}>
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
        {/* Header - shrink-0 */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#213448]">Unit Size vs Price</h3>
            </div>
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-xs px-2.5 py-1 rounded-full border bg-white text-[#547792] border-[#94B4C1] hover:bg-[#EAE0CF]/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh sample"
          >
            ↻ Refresh
          </button>
        </div>
        <p className="text-xs text-[#547792] mt-1">
          What you get for your budget
        </p>
      </div>

      {/* Sampling Note - shrink-0 */}
      <div className="shrink-0">
        <KeyInsightBox variant="info" compact title="Sampling Note">
          Stable sample (n = 2,000) balanced across CCR / RCR / OCR. ~2–3% margin of error (95% CI) for macro-level trends.
        </KeyInsightBox>
      </div>

      {/* Chart slot - flex-1 min-h-0 with h-full w-full inner wrapper */}
      <ChartSlot>
        <PreviewChartOverlay chartRef={chartRef}>
          <Scatter ref={chartRef} data={chartData} options={options} />
        </PreviewChartOverlay>
      </ChartSlot>

      {/* Footer - fixed height h-11 for consistent alignment */}
      <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
        <span className="truncate">{meta.sample_size.toLocaleString()} of {meta.total_count.toLocaleString()} transactions sampled</span>
        <span className="shrink-0 text-[#94B4C1]">Click refresh ↻ for new sample</span>
      </div>
    </div>
    </QueryState>
  );
}

export default UnitSizeVsPriceChart;
