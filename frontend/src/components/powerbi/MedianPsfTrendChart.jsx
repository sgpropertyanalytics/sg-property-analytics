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
 * Y-axis: Median PSF ($/PSF)
 * Lines: CCR, RCR, OCR (3 separate trend lines)
 *
 * Shows price trends by market segment to help buyers understand
 * whether prices are rising or falling in different regions.
 */
export function MedianPsfTrendChart({ height = 300 }) {
  const { buildApiParams, highlight, applyHighlight } = usePowerBIFilters();
  const [data, setData] = useState({ labels: [], ccr: [], rcr: [], ocr: [] });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // LOCAL drill state - each chart controls its own time granularity
  // This follows Power BI principle: Drill = Visual-local (only this chart changes)
  const [localDrillLevel, setLocalDrillLevel] = useState('year');
  const LOCAL_TIME_LEVELS = ['year', 'quarter', 'month'];
  const LOCAL_TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

  const handleLocalDrillUp = () => {
    const currentIndex = LOCAL_TIME_LEVELS.indexOf(localDrillLevel);
    if (currentIndex > 0) {
      setLocalDrillLevel(LOCAL_TIME_LEVELS[currentIndex - 1]);
    }
  };

  const handleLocalDrillDown = () => {
    const currentIndex = LOCAL_TIME_LEVELS.indexOf(localDrillLevel);
    if (currentIndex < LOCAL_TIME_LEVELS.length - 1) {
      setLocalDrillLevel(LOCAL_TIME_LEVELS[currentIndex + 1]);
    }
  };

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
        // Uses LOCAL drill level (not global drillPath.time) for visual-local drill behavior
        const params = buildApiParams({
          group_by: `${localDrillLevel},region`,
          metrics: 'median_psf,count'
        }, { excludeHighlight: true });

        const response = await getAggregate(params);
        const rawData = response.data.data || [];

        // Transform data: group by time period with CCR/RCR/OCR breakdown
        const groupedByTime = {};
        rawData.forEach(row => {
          const period = row[localDrillLevel];
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
  }, [buildApiParams, localDrillLevel]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const timeValue = data.labels[index];
      if (timeValue) {
        // Apply highlight - triggers cross-filter for OTHER charts
        applyHighlight('time', localDrillLevel, timeValue);
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-[#547792]">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 flex flex-col" style={{ minHeight: height }}>
        <div className="flex-1 flex items-center justify-center p-4">
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
  };

  // Calculate latest values for summary
  const latestCcr = data.ccr.filter(v => v != null).slice(-1)[0];
  const latestRcr = data.rcr.filter(v => v != null).slice(-1)[0];
  const latestOcr = data.ocr.filter(v => v != null).slice(-1)[0];

  return (
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[#213448]">Median PSF Trend</h3>
            {updating && (
              <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <DrillButtons
            localLevel={localDrillLevel}
            localLevels={LOCAL_TIME_LEVELS}
            localLevelLabels={LOCAL_TIME_LABELS}
            onLocalDrillUp={handleLocalDrillUp}
            onLocalDrillDown={handleLocalDrillDown}
          />
        </div>
        <p className="text-xs text-[#547792] mt-1">
          Price per sqft by market segment ({LOCAL_TIME_LABELS[localDrillLevel]})
        </p>
        <div className="text-xs text-[#547792] flex justify-center gap-3 mt-1">
          {latestCcr && <span>CCR: ${latestCcr.toLocaleString()}</span>}
          {latestRcr && <span>RCR: ${latestRcr.toLocaleString()}</span>}
          {latestOcr && <span>OCR: ${latestOcr.toLocaleString()}</span>}
        </div>
      </div>
      <div className="p-4" style={{ height }}>
        <Line key={localDrillLevel} ref={chartRef} data={chartData} options={options} />
      </div>
      <div className="px-4 py-2 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 text-xs text-[#547792]">
        <span>{data.labels.length} periods | Click to highlight time period</span>
      </div>
    </div>
  );
}

export default MedianPsfTrendChart;
