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
        // Group by time AND sale_type for stacked bar breakdown
        const params = buildApiParams({
          group_by: `${drillPath.time},sale_type`,
          metrics: 'count,total_value'
        }, { excludeHighlight: true });
        const response = await getAggregate(params);
        const rawData = response.data.data || [];

        // Transform data: group by time period with New Sale/Resale breakdown
        const groupedByTime = {};
        rawData.forEach(row => {
          const period = row[drillPath.time];
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

        // Apply highlight - this triggers cross-filter for OTHER charts
        // TimeTrendChart itself uses excludeHighlight:true to preserve full timeline
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
        borderWidth: 0,
        borderRadius: 3,  // Rounded tops for modern look
        borderSkipped: 'bottom',
        barPercentage: 0.7,  // Thinner bars
        categoryPercentage: 0.8,
        yAxisID: 'y',
        stack: 'transactions',
        order: 2,
      },
      {
        type: 'bar',
        label: 'Resale',
        data: resaleCounts,
        backgroundColor: resaleCounts.map((_, i) => `rgba(84, 119, 146, ${getBarOpacity(i)})`),  // Slate #547792
        borderColor: 'rgba(84, 119, 146, 1)',
        borderWidth: 0,
        borderRadius: { topLeft: 3, topRight: 3 },  // Only round top of stacked bar
        borderSkipped: 'bottom',
        barPercentage: 0.7,
        categoryPercentage: 0.8,
        yAxisID: 'y',
        stack: 'transactions',
        order: 2,
      },
      {
        type: 'line',
        label: 'Total Quantum',
        data: totalValues,
        borderColor: '#C5A572',  // Gold/Cream accent
        backgroundColor: 'rgba(197, 165, 114, 0.05)',
        borderWidth: 2.5,
        pointRadius: 0,  // Hide dots by default
        pointHoverRadius: 5,  // Show on hover
        pointBackgroundColor: '#C5A572',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        tension: 0.4,  // Smooth monotone curve
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
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'rectRounded',
          padding: 12,
          font: { size: 11 },
          color: '#547792',
        },
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
            if (label === 'Total Quantum') {
              if (value >= 1000000000) {
                return `${label}: $${(value / 1000000000).toFixed(2)}B`;
              }
              return `${label}: $${(value / 1000000).toFixed(0)}M`;
            }
            return `${label}: ${value.toLocaleString()}`;
          },
          afterBody: (tooltipItems) => {
            const index = tooltipItems[0]?.dataIndex;
            if (index !== undefined && data[index]) {
              const total = data[index].totalCount;
              return [`───────────`, `Total Volume: ${total.toLocaleString()}`];
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
    <div className={`bg-[#FDFBF7] rounded-lg border border-[#94B4C1]/30 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      <div className="px-4 py-3 border-b border-[#94B4C1]/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <h3 className="font-semibold text-[#213448]">Market Velocity</h3>
              <p className="text-[10px] text-[#94B4C1] tracking-wide uppercase">Volume & Liquidity Analysis</p>
            </div>
            {updating && (
              <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <DrillButtons hierarchyType="time" />
        </div>
      </div>
      <div className="bg-white m-2 rounded shadow-inner" style={{ height }}>
        <div className="p-3 h-full">
          <Chart ref={chartRef} type="bar" data={chartData} options={options} />
        </div>
      </div>
      <div className="px-4 py-2 text-[10px] text-[#94B4C1] flex justify-between items-center">
        <span>{data.length} {timeLabels[drillPath.time].toLowerCase()}s</span>
        <span className="font-medium">
          {data.reduce((sum, d) => sum + d.newSaleCount, 0).toLocaleString()} new · {data.reduce((sum, d) => sum + d.resaleCount, 0).toLocaleString()} resale
        </span>
      </div>
    </div>
  );
}

export default TimeTrendChart;
