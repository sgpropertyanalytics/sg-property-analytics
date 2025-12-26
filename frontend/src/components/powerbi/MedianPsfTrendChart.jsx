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
import { Line } from 'react-chartjs-2';
import { usePowerBIFilters, TIME_GROUP_BY } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { PreviewChartOverlay, ChartSlot } from '../ui';
import { baseChartJsOptions } from '../../constants/chartOptions';
import { transformTimeSeriesByRegion, logFetchDebug } from '../../adapters';

// Time level labels for display
const TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

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

/**
 * Median PSF Trend Chart - Line Chart by Market Segment
 *
 * X-axis: Time (drillable: year -> quarter -> month)
 * Y-axis: Median PSF ($/PSF)
 * Lines: CCR, RCR, OCR (3 separate trend lines)
 *
 * Shows price trends by market segment to help buyers understand
 * whether prices are rising or falling in different regions.
 */
export function MedianPsfTrendChart({ height = 300 }) {
  // Use global timeGrouping from context (controlled by toolbar toggle)
  // debouncedFilterKey prevents rapid-fire API calls during active filter adjustment
  const { buildApiParams, debouncedFilterKey, highlight, applyHighlight, timeGrouping } = usePowerBIFilters();
  const chartRef = useRef(null);

  // Fetch and transform data using adapter pattern
  // useAbortableQuery handles: abort controller, stale request protection, loading/error states
  const { data: rawData, loading, error, refetch } = useAbortableQuery(
    async (signal) => {
      // Build params with excludeHighlight: true so chart shows ALL periods
      const params = buildApiParams({
        group_by: `${TIME_GROUP_BY[timeGrouping]},region`,
        metrics: 'median_psf,count'
      }, { excludeHighlight: true });

      const response = await getAggregate(params, { signal });
      const apiData = response.data?.data || [];

      // Debug logging (dev only)
      logFetchDebug('MedianPsfTrendChart', {
        endpoint: '/api/aggregate',
        timeGrain: timeGrouping,
        response: response.data,
        rowCount: apiData.length,
      });

      // Use adapter for transformation (schema-safe, sorted)
      return transformTimeSeriesByRegion(apiData, timeGrouping);
    },
    [debouncedFilterKey, timeGrouping],
    { initialData: [] }
  );

  // Transform adapter output to chart-ready format
  const data = useMemo(() => ({
    labels: rawData.map(d => d.period ?? ''),
    ccr: rawData.map(d => d.ccrMedianPsf),
    rcr: rawData.map(d => d.rcrMedianPsf),
    ocr: rawData.map(d => d.ocrMedianPsf),
    ccrCount: rawData.map(d => d.ccrCount),
    rcrCount: rawData.map(d => d.rcrCount),
    ocrCount: rawData.map(d => d.ocrCount),
  }), [rawData]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const timeValue = data.labels[index];
      if (timeValue) {
        // Apply highlight - triggers cross-filter for OTHER charts
        applyHighlight('time', timeGrouping, timeValue);
      }
    }
  };

  // Determine highlighted index for visual emphasis
  const highlightedIndex = highlight.source === 'time' && highlight.value
    ? data.labels.indexOf(String(highlight.value))
    : -1;

  // Calculate min/max for better Y-axis scaling
  const allValues = [...data.ccr, ...data.rcr, ...data.ocr].filter(v => v != null);
  const minPsf = Math.min(...allValues);
  const maxPsf = Math.max(...allValues);
  const padding = (maxPsf - minPsf) * 0.1;

  // Region colors from palette
  const regionColors = {
    CCR: {
      line: 'rgba(33, 52, 72, 1)',      // Deep Navy #213448
      point: 'rgba(33, 52, 72, 0.9)',
      pointBorder: 'rgba(33, 52, 72, 1)',
    },
    RCR: {
      line: 'rgba(84, 119, 146, 1)',    // Ocean Blue #547792
      point: 'rgba(84, 119, 146, 0.9)',
      pointBorder: 'rgba(84, 119, 146, 1)',
    },
    OCR: {
      line: 'rgba(148, 180, 193, 1)',   // Sky Blue #94B4C1
      point: 'rgba(148, 180, 193, 0.9)',
      pointBorder: 'rgba(148, 180, 193, 1)',
    },
  };

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'CCR (Core Central)',
        data: data.ccr,
        borderColor: regionColors.CCR.line,
        backgroundColor: regionColors.CCR.point,
        pointBackgroundColor: data.ccr.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? regionColors.CCR.point
            : 'rgba(33, 52, 72, 0.3)'
        ),
        pointBorderColor: regionColors.CCR.pointBorder,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.4,
        spanGaps: true,
      },
      {
        label: 'RCR (Rest of Central)',
        data: data.rcr,
        borderColor: regionColors.RCR.line,
        backgroundColor: regionColors.RCR.point,
        pointBackgroundColor: data.rcr.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? regionColors.RCR.point
            : 'rgba(84, 119, 146, 0.3)'
        ),
        pointBorderColor: regionColors.RCR.pointBorder,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.4,
        spanGaps: true,
      },
      {
        label: 'OCR (Outside Central)',
        data: data.ocr,
        borderColor: regionColors.OCR.line,
        backgroundColor: regionColors.OCR.point,
        pointBackgroundColor: data.ocr.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? regionColors.OCR.point
            : 'rgba(148, 180, 193, 0.3)'
        ),
        pointBorderColor: regionColors.OCR.pointBorder,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.4,
        spanGaps: true,
      },
    ],
  };

  const options = useMemo(() => ({
    ...baseChartJsOptions,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    onClick: handleClick,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 11,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (value == null) return `${label}: No data`;

            // Get transaction count for this region
            const index = context.dataIndex;
            let count = 0;
            if (label.includes('CCR')) count = data.ccrCount?.[index] || 0;
            else if (label.includes('RCR')) count = data.rcrCount?.[index] || 0;
            else if (label.includes('OCR')) count = data.ocrCount?.[index] || 0;

            return `${label}: $${value.toLocaleString()} PSF (${count.toLocaleString()} transactions)`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        min: Math.floor((minPsf - padding) / 100) * 100,
        max: Math.ceil((maxPsf + padding) / 100) * 100,
        title: {
          display: true,
          text: 'Median PSF ($/PSF)',
        },
        ticks: {
          callback: (value) => `$${value.toLocaleString()}`,
        },
      },
    },
  }), [handleClick, data, minPsf, maxPsf, padding]);

  // Calculate latest values for summary
  const latestCcr = data.ccr.filter(v => v != null).slice(-1)[0];
  const latestRcr = data.rcr.filter(v => v != null).slice(-1)[0];
  const latestOcr = data.ocr.filter(v => v != null).slice(-1)[0];

  // Card layout: flex column with fixed height, header/footer shrink-0, chart fills remaining
  const cardHeight = height + 120; // height prop for chart + ~120px for header/footer

  return (
    <QueryState loading={loading} error={error} onRetry={refetch} empty={!rawData || rawData.length === 0} skeleton="line" height={350}>
      <div
        className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col"
        style={{ height: cardHeight }}
      >
      {/* Header - shrink-0 */}
      <div className="px-4 py-3 border-b border-[#94B4C1]/30 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[#213448]">Median PSF Trend</h3>
        </div>
        <p className="text-xs text-[#547792] mt-1">
          Price per sqft by market segment ({TIME_LABELS[timeGrouping]})
        </p>
        <div className="text-xs text-[#547792] flex justify-center gap-3 mt-1">
          {latestCcr && <span>CCR: ${latestCcr.toLocaleString()}</span>}
          {latestRcr && <span>RCR: ${latestRcr.toLocaleString()}</span>}
          {latestOcr && <span>OCR: ${latestOcr.toLocaleString()}</span>}
        </div>
      </div>
      {/* Chart slot - Chart.js handles data updates efficiently without key remount */}
      <ChartSlot>
        <PreviewChartOverlay chartRef={chartRef}>
          <Line ref={chartRef} data={chartData} options={options} />
        </PreviewChartOverlay>
      </ChartSlot>
      {/* Footer - fixed height h-11 for consistent alignment */}
      <div className="shrink-0 h-11 px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 flex items-center text-xs text-[#547792]">
        <span className="truncate">{data.labels.length} periods | Click to highlight time period</span>
      </div>
      </div>
    </QueryState>
  );
}

export default MedianPsfTrendChart;
