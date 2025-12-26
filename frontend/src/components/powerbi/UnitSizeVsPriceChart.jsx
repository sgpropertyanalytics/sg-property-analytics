import React, { useRef, useMemo } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';

import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { useAbortableQuery } from '../../hooks/useAbortableQuery';
import { getAggregate } from '../../api/client';
import { QueryState } from '../common/QueryState';
import { ChartSlot } from '../ui/ChartSlot';
import { baseChartJsOptions } from '../../constants/chartOptions';

// Register Chart.js components
ChartJS.register(LinearScale, PointElement, Tooltip, Legend);

/**
 * Bedroom colors from CLAUDE.md color palette
 * Each bedroom type gets a distinct color for visual differentiation
 */
const BEDROOM_COLORS = {
  1: { bg: 'rgba(247, 190, 129, 0.7)', border: 'rgba(247, 190, 129, 1)' }, // Orange - 1BR
  2: { bg: 'rgba(79, 129, 189, 0.7)', border: 'rgba(79, 129, 189, 1)' },   // Blue - 2BR
  3: { bg: 'rgba(40, 82, 122, 0.7)', border: 'rgba(40, 82, 122, 1)' },     // Dark blue - 3BR
  4: { bg: 'rgba(17, 43, 60, 0.7)', border: 'rgba(17, 43, 60, 1)' },       // Navy - 4BR
  5: { bg: 'rgba(155, 187, 89, 0.7)', border: 'rgba(155, 187, 89, 1)' },   // Green - 5+ BR
};

const BEDROOM_LABELS = {
  1: '1 BR',
  2: '2 BR',
  3: '3 BR',
  4: '4 BR',
  5: '5+ BR',
};

// Minimum observations per data point for K-anonymity compliance
const MIN_OBSERVATIONS = 3;

/**
 * UnitSizeVsPriceChart - Compliant aggregated scatter plot
 *
 * Shows average unit size (X) vs average PSF (Y) for project × bedroom combinations.
 * Each dot represents an aggregate of multiple transactions, NOT individual transactions.
 *
 * Compliance:
 * - Per LEGAL_COMPLIANCE.md: "Scatter plots (aggregated)" = Allowed
 * - Each dot = project × bedroom aggregate (NOT individual transaction)
 * - Minimum 3 observations per dot (K-anonymity)
 * - Tooltip shows "Observations" not "Transactions"
 */
export function UnitSizeVsPriceChart({ height = 350 }) {
  const chartRef = useRef(null);
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();

  // Fetch aggregated data: group by project AND bedroom
  // Limit to top 500 most active combinations for performance
  const { data, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({
        group_by: 'project,bedroom',
        metrics: 'count,avg_psf,avg_size',
        limit: 500,  // Top 500 by transaction count (ordered by count DESC)
      });

      const response = await getAggregate(params, { signal });
      const raw = response.data?.data || [];

      // Filter to combinations with enough observations (K-anonymity)
      return raw.filter((d) => (d.count || 0) >= MIN_OBSERVATIONS);
    },
    [debouncedFilterKey],
    { initialData: [] }
  );

  // Transform data into Chart.js datasets (one per bedroom type)
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return { datasets: [] };
    }

    // Group data points by bedroom type
    const byBedroom = { 1: [], 2: [], 3: [], 4: [], 5: [] };

    data.forEach((d) => {
      // Get bedroom count, cap at 5 for "5+ BR"
      const br = Math.min(d.bedroom || d.bedroomCount || 3, 5);
      const avgSize = d.avg_size || d.avgSize;
      const avgPsf = d.avg_psf || d.avgPsf;

      // Skip if missing required data
      if (!avgSize || !avgPsf) return;

      byBedroom[br].push({
        x: avgSize,
        y: avgPsf,
        project: d.project,
        bedroom: br,
        count: d.count,
      });
    });

    // Create one dataset per bedroom type (only if has data)
    return {
      datasets: Object.entries(byBedroom)
        .filter(([, points]) => points.length > 0)
        .map(([br, points]) => ({
          label: BEDROOM_LABELS[br],
          data: points,
          backgroundColor: BEDROOM_COLORS[br].bg,
          borderColor: BEDROOM_COLORS[br].border,
          borderWidth: 1,
          pointRadius: 6,
          pointHoverRadius: 9,
        })),
    };
  }, [data]);

  // Chart.js options
  const options = useMemo(
    () => ({
      ...baseChartJsOptions,
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          title: {
            display: true,
            text: 'Avg Unit Size (sqft)',
            color: '#547792',
            font: { size: 12 },
          },
          grid: { color: 'rgba(148, 180, 193, 0.2)' },
          ticks: {
            color: '#547792',
            callback: (value) => value.toLocaleString(),
          },
          min: 0,
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Avg PSF ($)',
            color: '#547792',
            font: { size: 12 },
          },
          grid: { color: 'rgba(148, 180, 193, 0.2)' },
          ticks: {
            color: '#547792',
            callback: (value) => `$${value.toLocaleString()}`,
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 15,
            color: '#213448',
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(33, 52, 72, 0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(148, 180, 193, 0.5)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: (ctx) => {
              if (ctx.length === 0) return '';
              return ctx[0].raw.project;
            },
            label: (ctx) => {
              const { bedroom, x, y, count } = ctx.raw;
              return [
                `${BEDROOM_LABELS[bedroom]}`,
                `Avg Size: ${Math.round(x).toLocaleString()} sqft`,
                `Avg PSF: $${Math.round(y).toLocaleString()}`,
                `Observations: ${count}`,
              ];
            },
          },
        },
      },
    }),
    []
  );

  // Calculate total point count for footer
  const totalPoints = useMemo(() => {
    return chartData.datasets.reduce((sum, ds) => sum + ds.data.length, 0);
  }, [chartData]);

  // Card height calculation
  const cardHeight = height + 190;

  return (
    <QueryState
      loading={loading}
      error={error}
      onRetry={refetch}
      empty={!data || data.length === 0}
      emptyMessage="No aggregated data available for current filters"
    >
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
          <h3 className="font-semibold text-[#213448]">
            Unit Size vs PSF by Bedroom
          </h3>
          <p className="text-xs text-[#547792] mt-1">
            Each point represents a project × bedroom aggregate
          </p>
        </div>

        {/* Chart */}
        <ChartSlot>
          <Scatter ref={chartRef} data={chartData} options={options} />
        </ChartSlot>

        {/* Footer */}
        <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center justify-between gap-3 text-xs text-[#547792]">
          <span>{totalPoints.toLocaleString()} project-bedroom combinations</span>
          <span className="text-[#94B4C1]">Min {MIN_OBSERVATIONS} observations per point</span>
        </div>
      </div>
    </QueryState>
  );
}

export default UnitSizeVsPriceChart;
