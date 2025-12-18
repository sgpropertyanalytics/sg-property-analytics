import React, { useEffect, useState, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
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
  LineElement,
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
 * - Cross-filtering: clicking a bar filters all other charts
 * - Drill-down: click to drill into finer time granularity
 */
export function TimeTrendChart({ onCrossFilter, onDrillThrough, height = 300 }) {
  const { buildApiParams, drillPath, crossFilter, applyCrossFilter, drillDown } = usePowerBIFilters();
  const [data, setData] = useState([]);
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
        const params = buildApiParams({
          group_by: drillPath.time,
          metrics: 'count,median_psf,avg_psf'
        });
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

        // Apply cross-filter
        if (onCrossFilter) {
          onCrossFilter('time', drillPath.time, timeValue);
        } else {
          applyCrossFilter('time', drillPath.time, timeValue);
        }
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

  const labels = data.map(d => d[drillPath.time] || 'Unknown');
  const counts = data.map(d => d.count || 0);
  const medianPsfs = data.map(d => d.median_psf || 0);

  // Determine which bars should be highlighted based on cross-filter
  const highlightedIndex = crossFilter.source === 'time' && crossFilter.value
    ? labels.indexOf(crossFilter.value)
    : -1;

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Transaction Count',
        data: counts,
        backgroundColor: labels.map((_, i) =>
          highlightedIndex === -1 || highlightedIndex === i
            ? 'rgba(84, 119, 146, 0.8)'  // #547792
            : 'rgba(84, 119, 146, 0.3)'
        ),
        borderColor: 'rgba(33, 52, 72, 1)',  // #213448
        borderWidth: 1,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Median PSF',
        data: medianPsfs,
        borderColor: 'rgba(33, 52, 72, 1)',  // #213448
        backgroundColor: 'rgba(33, 52, 72, 0.1)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: 'rgba(33, 52, 72, 1)',
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
            if (label === 'Median PSF') {
              return `${label}: $${value.toLocaleString()}`;
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
        title: {
          display: true,
          text: 'Median PSF ($)',
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          callback: (value) => `$${value.toLocaleString()}`,
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
