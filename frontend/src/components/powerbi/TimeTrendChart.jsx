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
  const { buildApiParams, highlight, applyHighlight } = usePowerBIFilters();
  const [data, setData] = useState([]);
  const [dataTimeGrain, setDataTimeGrain] = useState(null); // Track which time grain the data is for
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
        // Group by time AND sale_type for stacked bar breakdown
        // Uses LOCAL drill level (not global drillPath.time) for visual-local drill behavior
        const params = buildApiParams({
          group_by: `${localDrillLevel},sale_type`,
          metrics: 'count,total_value'
        }, { excludeHighlight: true });
        const response = await getAggregate(params);
        const rawData = response.data.data || [];

        // Transform data: group by time period with New Sale/Resale breakdown
        const groupedByTime = {};
        rawData.forEach(row => {
          const period = row[localDrillLevel];
          if (!groupedByTime[period]) {
            groupedByTime[period] = {
              period,
              newSaleCount: 0,
              resaleCount: 0,
              newSaleValue: 0,
              resaleValue: 0,
              totalCount: 0,
              totalValue: 0,
            };
          }
          const saleType = row.sale_type?.toLowerCase() || '';
          if (saleType.includes('new')) {
            groupedByTime[period].newSaleCount += row.count || 0;
            groupedByTime[period].newSaleValue += row.total_value || 0;
          } else {
            groupedByTime[period].resaleCount += row.count || 0;
            groupedByTime[period].resaleValue += row.total_value || 0;
          }
          groupedByTime[period].totalCount += row.count || 0;
          groupedByTime[period].totalValue += row.total_value || 0;
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

        setData(sortedData);
        setDataTimeGrain(localDrillLevel); // Store which time grain this data is for
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
  }, [buildApiParams, localDrillLevel]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedItem = data[index];
      if (clickedItem) {
        const timeValue = clickedItem.period;

        // Apply highlight - this triggers cross-filter for OTHER charts
        // TimeTrendChart itself uses excludeHighlight:true to preserve full timeline
        applyHighlight('time', localDrillLevel, timeValue);
      }
    }
  };

  const handleDoubleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      // Double-click drills down locally (visual-local behavior)
      handleLocalDrillDown();
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
  const labels = data.map(d => d.period ?? '');
  const newSaleCounts = data.map(d => d.newSaleCount || 0);
  const resaleCounts = data.map(d => d.resaleCount || 0);
  const totalCounts = data.map(d => d.totalCount || 0);
  const totalValues = data.map(d => d.totalValue || 0);

  // Find peak values for gradient coloring
  const maxCount = Math.max(...totalCounts, 1);

  // Extend y axis (count) slightly to leave room for line above
  const yAxisMax = Math.ceil(maxCount * 1.4); // Bars occupy ~70% of chart height

  // Determine which bars should be highlighted based on highlight state
  const highlightedIndex = highlight.source === 'time' && highlight.value
    ? labels.indexOf(String(highlight.value))
    : -1;

  // Get bar opacity based on highlight state
  const getBarOpacity = (index) => {
    return highlightedIndex === -1 || highlightedIndex === index ? 0.9 : 0.3;
  };

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'New Sale',
        data: newSaleCounts,
        backgroundColor: newSaleCounts.map((_, i) => `rgba(33, 52, 72, ${getBarOpacity(i)})`),  // Deep Navy #213448
        borderColor: 'rgba(33, 52, 72, 1)',
        borderWidth: 1,
        yAxisID: 'y',
        stack: 'transactions',
        order: 2,
      },
      {
        type: 'bar',
        label: 'Resale',
        data: resaleCounts,
        backgroundColor: resaleCounts.map((_, i) => `rgba(84, 119, 146, ${getBarOpacity(i)})`),  // Ocean Blue #547792
        borderColor: 'rgba(84, 119, 146, 1)',
        borderWidth: 1,
        yAxisID: 'y',
        stack: 'transactions',
        order: 2,
      },
      {
        type: 'line',
        label: 'Total Transaction Value',
        data: totalValues,
        borderColor: '#8B7355',  // Dark tan/brown for better visibility
        backgroundColor: 'rgba(139, 115, 85, 0.1)',
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: '#A89078',  // Medium tan fill
        pointBorderColor: '#8B7355',  // Dark tan border
        pointBorderWidth: 1,
        tension: 0.4,  // Smooth curve
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
            if (label === 'Total Transaction Value') {
              // Format in millions or billions
              if (value >= 1000000000) {
                return `${label}: $${(value / 1000000000).toFixed(2)}B`;
              }
              return `${label}: $${(value / 1000000).toFixed(0)}M`;
            }
            return `${label}: ${value.toLocaleString()}`;
          },
          afterBody: (tooltipItems) => {
            // Show total transaction count after the individual items
            const index = tooltipItems[0]?.dataIndex;
            if (index !== undefined && data[index]) {
              const total = data[index].totalCount;
              return [`Total: ${total.toLocaleString()}`];
            }
            return [];
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,  // Enable stacking on x-axis for bar grouping
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
        stacked: true,  // Enable stacking for New Sale + Resale bars
        max: yAxisMax, // Extended max to push bars lower, leaving room for line above
        title: {
          display: true,
          text: 'Transaction Count',
        },
        grid: {
          drawOnChartArea: true,
        },
        ticks: {
          callback: (value) => Math.round(value).toLocaleString(), // Fix floating point precision
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0, // Grounded at $0M
        title: {
          display: true,
          text: 'Total Transaction Value ($)',
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
          <DrillButtons
            localLevel={localDrillLevel}
            localLevels={LOCAL_TIME_LEVELS}
            localLevelLabels={LOCAL_TIME_LABELS}
            onLocalDrillUp={handleLocalDrillUp}
            onLocalDrillDown={handleLocalDrillDown}
          />
        </div>
        <p className="text-xs text-[#547792] mt-1">
          Volume and price by {LOCAL_TIME_LABELS[localDrillLevel]}
          {localDrillLevel !== 'month' && (
            <span className="text-[#547792] font-medium ml-1">(double-click to drill down)</span>
          )}
        </p>
        <div className="text-xs text-[#547792] text-center mt-1">
          {data.length} periods | {data.reduce((sum, d) => sum + d.newSaleCount, 0).toLocaleString()} new + {data.reduce((sum, d) => sum + d.resaleCount, 0).toLocaleString()} resale
        </div>
      </div>
      <div className="p-4" style={{ height }}>
        <Chart key={localDrillLevel} ref={chartRef} type="bar" data={chartData} options={options} />
      </div>
    </div>
  );
}

export default TimeTrendChart;
