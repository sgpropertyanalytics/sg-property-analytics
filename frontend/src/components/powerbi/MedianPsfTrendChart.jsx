import React, { useEffect, useState, useRef } from 'react';
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
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { DrillButtons } from './DrillButtons';

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
 * Y-axis: Median PSF ($/psf)
 * Lines: CCR, RCR, OCR (3 separate trend lines)
 *
 * Shows price trends by market segment to help buyers understand
 * whether prices are rising or falling in different regions.
 */
export function MedianPsfTrendChart({ height = 300 }) {
  const { buildApiParams, drillPath, highlight, applyHighlight } = usePowerBIFilters();
  const [data, setData] = useState({ labels: [], ccr: [], rcr: [], ocr: [] });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Fetch data when filters change
  useEffect(() => {
    const fetchData = async () => {
      if (isInitialLoad.current) {
        setLoading(true);
      } else {
        setUpdating(true);
      }
      setError(null);
      try {
        // Use excludeHighlight: true so chart shows ALL periods
        // Group by time AND region for segment breakdown
        const params = buildApiParams({
          group_by: `${drillPath.time},region`,
          metrics: 'median_psf,count'
        }, { excludeHighlight: true });

        const response = await getAggregate(params);
        const rawData = response.data.data || [];

        // Transform data: group by time period with CCR/RCR/OCR breakdown
        const groupedByTime = {};
        rawData.forEach(row => {
          const period = row[drillPath.time];
          if (!groupedByTime[period]) {
            groupedByTime[period] = {
              period,
              CCR: null,
              RCR: null,
              OCR: null,
              ccrCount: 0,
              rcrCount: 0,
              ocrCount: 0,
            };
          }
          const region = row.region?.toUpperCase();
          if (region === 'CCR') {
            groupedByTime[period].CCR = row.median_psf;
            groupedByTime[period].ccrCount = row.count || 0;
          } else if (region === 'RCR') {
            groupedByTime[period].RCR = row.median_psf;
            groupedByTime[period].rcrCount = row.count || 0;
          } else if (region === 'OCR') {
            groupedByTime[period].OCR = row.median_psf;
            groupedByTime[period].ocrCount = row.count || 0;
          }
        });

        // Convert to sorted array
        const sortedData = Object.values(groupedByTime).sort((a, b) => {
          const aKey = a.period;
          const bKey = b.period;
          if (aKey == null) return -1;
          if (bKey == null) return 1;
          if (typeof aKey === 'number' && typeof bKey === 'number') {
            return aKey - bKey;
          }
          return String(aKey).localeCompare(String(bKey));
        });

        setData({
          labels: sortedData.map(d => d.period ?? ''),
          ccr: sortedData.map(d => d.CCR),
          rcr: sortedData.map(d => d.RCR),
          ocr: sortedData.map(d => d.OCR),
          ccrCount: sortedData.map(d => d.ccrCount),
          rcrCount: sortedData.map(d => d.rcrCount),
          ocrCount: sortedData.map(d => d.ocrCount),
        });
        isInitialLoad.current = false;
      } catch (err) {
        console.error('Error fetching median PSF trend data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setUpdating(false);
      }
    };
    fetchData();
  }, [buildApiParams, drillPath.time]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const timeValue = data.labels[index];
      if (timeValue) {
        // Apply highlight - triggers cross-filter for OTHER charts
        applyHighlight('time', drillPath.time, timeValue);
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-[#FDFBF7] rounded-lg border border-[#94B4C1]/30 p-4" style={{ height: height + 80 }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-[#94B4C1]">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#FDFBF7] rounded-lg border border-[#94B4C1]/30 p-4" style={{ height: height + 80 }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  // Determine highlighted index for visual emphasis
  const highlightedIndex = highlight.source === 'time' && highlight.value
    ? data.labels.indexOf(String(highlight.value))
    : -1;

  // Calculate min/max for better Y-axis scaling
  const allValues = [...data.ccr, ...data.rcr, ...data.ocr].filter(v => v != null);
  const minPsf = Math.min(...allValues);
  const maxPsf = Math.max(...allValues);
  const padding = (maxPsf - minPsf) * 0.1;

  // Region colors with visual weight hierarchy
  const regionConfig = {
    CCR: {
      color: '#213448',      // Deep Navy - Heavyweight (most expensive)
      weight: 3,
    },
    RCR: {
      color: '#547792',      // Steel Blue - Medium weight
      weight: 2,
    },
    OCR: {
      color: '#94B4C1',      // Muted Blue/Grey - Light weight
      weight: 1.5,
    },
  };

  // Only show dot on last data point
  const lastIndex = data.labels.length - 1;

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'CCR',
        data: data.ccr,
        borderColor: regionConfig.CCR.color,
        backgroundColor: regionConfig.CCR.color,
        borderWidth: regionConfig.CCR.weight,
        pointRadius: data.ccr.map((_, i) => i === lastIndex ? 5 : 0),  // Only show last point
        pointHoverRadius: 6,
        pointBackgroundColor: regionConfig.CCR.color,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'RCR',
        data: data.rcr,
        borderColor: regionConfig.RCR.color,
        backgroundColor: regionConfig.RCR.color,
        borderWidth: regionConfig.RCR.weight,
        pointRadius: data.rcr.map((_, i) => i === lastIndex ? 4 : 0),
        pointHoverRadius: 5,
        pointBackgroundColor: regionConfig.RCR.color,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'OCR',
        data: data.ocr,
        borderColor: regionConfig.OCR.color,
        backgroundColor: regionConfig.OCR.color,
        borderWidth: regionConfig.OCR.weight,
        pointRadius: data.ocr.map((_, i) => i === lastIndex ? 3 : 0),
        pointHoverRadius: 4,
        pointBackgroundColor: regionConfig.OCR.color,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    onClick: handleClick,
    plugins: {
      legend: {
        display: false,  // We'll use custom inline labels
      },
      tooltip: {
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(197, 165, 114, 0.3)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (value == null) return `${label}: No data`;

            const index = context.dataIndex;
            let count = 0;
            if (label === 'CCR') count = data.ccrCount?.[index] || 0;
            else if (label === 'RCR') count = data.rcrCount?.[index] || 0;
            else if (label === 'OCR') count = data.ocrCount?.[index] || 0;

            return `${label}: $${value.toLocaleString()} psf (${count.toLocaleString()} txns)`;
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
          font: { size: 10 },
          color: '#94B4C1',
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        min: Math.floor((minPsf - padding) / 100) * 100,
        max: Math.ceil((maxPsf + padding) / 100) * 100,
        grid: {
          color: 'rgba(148, 180, 193, 0.15)',
        },
        ticks: {
          callback: (value) => `$${value.toLocaleString()}`,
          font: { size: 10 },
          color: '#94B4C1',
        },
      },
    },
  };

  const timeLabels = {
    year: 'Year',
    quarter: 'Quarter',
    month: 'Month'
  };

  // Calculate latest values for summary
  const latestCcr = data.ccr.filter(v => v != null).slice(-1)[0];
  const latestRcr = data.rcr.filter(v => v != null).slice(-1)[0];
  const latestOcr = data.ocr.filter(v => v != null).slice(-1)[0];

  return (
    <div className={`bg-[#FDFBF7] rounded-lg border border-[#94B4C1]/30 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      <div className="px-4 py-3 border-b border-[#94B4C1]/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <h3 className="font-semibold text-[#213448]">Price Action by Region</h3>
              <p className="text-[10px] text-[#94B4C1] tracking-wide uppercase">PSF Trends · CCR vs RCR vs OCR</p>
            </div>
            {updating && (
              <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <DrillButtons hierarchyType="time" />
        </div>
      </div>
      <div className="bg-white m-2 rounded shadow-inner relative" style={{ height }}>
        <div className="p-3 h-full">
          <Line ref={chartRef} data={chartData} options={options} />
        </div>
        {/* Direct labels on right side */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 text-[10px] font-medium">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-[3px] rounded-full" style={{ backgroundColor: '#213448' }} />
            <span className="text-[#213448]">CCR ${latestCcr?.toLocaleString() || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-[2px] rounded-full" style={{ backgroundColor: '#547792' }} />
            <span className="text-[#547792]">RCR ${latestRcr?.toLocaleString() || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-[1.5px] rounded-full" style={{ backgroundColor: '#94B4C1' }} />
            <span className="text-[#94B4C1]">OCR ${latestOcr?.toLocaleString() || '—'}</span>
          </div>
        </div>
      </div>
      <div className="px-4 py-2 text-[10px] text-[#94B4C1] flex justify-between items-center">
        <span>{data.labels.length} {timeLabels[drillPath.time].toLowerCase()}s</span>
        <span>Click any point to cross-filter</span>
      </div>
    </div>
  );
}

export default MedianPsfTrendChart;
