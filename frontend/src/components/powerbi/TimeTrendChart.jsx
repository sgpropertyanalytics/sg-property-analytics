import React, { useEffect, useState, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
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
import { DrillButtons } from './DrillButtons';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend
);

/**
 * Time Trend Chart - Line + Bar Combo
 *
 * X-axis: Month (drillable up to Quarter/Year)
 * Y1 (bars): Transaction Count
 * Y2 (line): Median PSF
 *
 * Supports:
 * - Cross-highlighting: clicking a bar highlights it and dims others (no data filtering)
 * - Drill-down: double-click to drill into finer time granularity
 */
export function TimeTrendChart({ onCrossFilter, onDrillThrough, height = 300 }) {
  const { buildApiParams, drillPath, highlight, applyHighlight, drillDown } = usePowerBIFilters();
  const [data, setData] = useState([]);
  const [dataTimeGrain, setDataTimeGrain] = useState(null); // Track which time grain the data is for
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Fetch data when filters change
  useEffect(() => {
    const fetchData = async () => {
      // Only show full loading on initial load, otherwise show subtle updating
      if (isInitialLoad.current) {
        setLoading(true);
      } else {
        setUpdating(true);
      }
      setError(null);
      try {
        // Use excludeHighlight: true so time chart shows ALL periods
        // even when a specific time period is highlighted
        const params = buildApiParams({
          group_by: drillPath.time,
          metrics: 'count,total_value'
        }, { excludeHighlight: true });
        const response = await getAggregate(params);
        // Sort by time - handle both string and numeric values
        const sortedData = (response.data.data || []).sort((a, b) => {
          const aKey = a[drillPath.time];
          const bKey = b[drillPath.time];
          // Handle null/undefined
          if (aKey == null) return -1;
          if (bKey == null) return 1;
          // Use numeric comparison for numbers, string comparison otherwise
          if (typeof aKey === 'number' && typeof bKey === 'number') {
            return aKey - bKey;
          }
          return String(aKey).localeCompare(String(bKey));
        });
        setData(sortedData);
        setDataTimeGrain(drillPath.time); // Store which time grain this data is for
        isInitialLoad.current = false;
      } catch (err) {
        console.error('Error fetching time trend data:', err);
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
      const clickedItem = data[index];
      if (clickedItem) {
        const timeValue = clickedItem[drillPath.time];

        // Apply highlight (visual only, doesn't filter data)
        // This preserves context while emphasizing the selection
        applyHighlight('time', drillPath.time, timeValue);
      }
    }
  };

  const handleDoubleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedItem = data[index];
      if (clickedItem) {
        const timeValue = clickedItem[drillPath.time];
        // Drill down into the time period
        drillDown('time', timeValue);
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-[#547792]">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  // Use the time grain that matches the current data to avoid "Unknown" labels during drill transitions
  // If data doesn't match current drillPath.time, use dataTimeGrain (which matches the data)
  const displayTimeGrain = dataTimeGrain || drillPath.time;
  const labels = data.map(d => d[displayTimeGrain] ?? '');
  const counts = data.map(d => d.count || 0);
  const totalValues = data.map(d => d.total_value || 0);

  // Find peak values for gradient coloring
  const maxCount = Math.max(...counts);
  const avgCount = counts.reduce((sum, c) => sum + c, 0) / counts.length;
  const peakThreshold = avgCount + (maxCount - avgCount) * 0.5; // 50% above average towards max

  // Extend y axis (count) to push bars lower, making room for line above
  const yAxisMax = maxCount * 2.2; // Bars occupy ~45% of chart height

  // Determine which bars should be highlighted based on highlight state
  const highlightedIndex = highlight.source === 'time' && highlight.value
    ? labels.indexOf(highlight.value)
    : -1;

  // Generate gradient colors for bars based on count intensity
  // Using color palette: #213448 (Deep Navy) for peaks, #547792 (Ocean Blue) normal, #94B4C1 (Sky Blue) low
  const getBarColor = (count, index) => {
    const isHighlighted = highlightedIndex === -1 || highlightedIndex === index;
    const opacity = isHighlighted ? 0.9 : 0.3;

    if (count >= peakThreshold) {
      // Peak months - Deep Navy (#213448)
      return `rgba(33, 52, 72, ${opacity})`;
    } else if (count >= avgCount) {
      // Above average - Ocean Blue (#547792)
      return `rgba(84, 119, 146, ${opacity})`;
    } else {
      // Below average - Sky Blue (#94B4C1)
      return `rgba(148, 180, 193, ${opacity})`;
    }
  };

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Transaction Count',
        data: counts,
        backgroundColor: counts.map((count, i) => getBarColor(count, i)),
        borderColor: counts.map((count) =>
          count >= peakThreshold
            ? 'rgba(33, 52, 72, 1)'     // #213448 - Deep Navy border for peaks
            : count >= avgCount
              ? 'rgba(84, 119, 146, 1)'  // #547792 - Ocean Blue border
              : 'rgba(148, 180, 193, 1)' // #94B4C1 - Sky Blue border
        ),
        borderWidth: 1,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Total Quantum',
        data: totalValues,
        borderColor: '#EAE0CF',  // Sand/Cream - contrasts with blue bars
        backgroundColor: 'rgba(234, 224, 207, 0.1)',
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: '#EAE0CF',
        pointBorderColor: '#213448',  // Deep Navy outline for visibility
        pointBorderWidth: 2,
        fill: false,
        yAxisID: 'y1',
        order: 1,
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
    onDblClick: handleDoubleClick,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label === 'Total Quantum') {
              // Format in millions or billions
              if (value >= 1000000000) {
                return `${label}: $${(value / 1000000000).toFixed(2)}B`;
              }
              return `${label}: $${(value / 1000000).toFixed(0)}M`;
            }
            return `${label}: ${value.toLocaleString()}`;
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
        max: yAxisMax, // Extended max to push bars lower, leaving room for line above
        title: {
          display: true,
          text: 'Transaction Count',
        },
        grid: {
          drawOnChartArea: true,
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0, // Grounded at $0M
        title: {
          display: true,
          text: 'Total Quantum ($)',
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          callback: (value) => {
            if (value >= 1000000000) {
              return `$${(value / 1000000000).toFixed(1)}B`;
            }
            return `$${(value / 1000000).toFixed(0)}M`;
          },
        },
      },
    },
  };

  const timeLabels = {
    year: 'Year',
    quarter: 'Quarter',
    month: 'Month'
  };

  return (
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[#213448]">Transaction Trend</h3>
            {updating && (
              <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <DrillButtons hierarchyType="time" />
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-[#547792]">
            Volume and price by {timeLabels[drillPath.time]}
            {drillPath.time !== 'month' && (
              <span className="text-[#547792] font-medium ml-1">(click to drill down)</span>
            )}
          </p>
          <div className="text-xs text-[#547792]">
            {data.length} periods | {data.reduce((sum, d) => sum + (d.count || 0), 0).toLocaleString()} txns
          </div>
        </div>
      </div>
      <div className="p-4" style={{ height }}>
        <Chart ref={chartRef} type="bar" data={chartData} options={options} />
      </div>
    </div>
  );
}

export default TimeTrendChart;
