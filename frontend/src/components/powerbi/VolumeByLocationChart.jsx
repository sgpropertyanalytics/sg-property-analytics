import React, { useEffect, useState, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { DISTRICT_NAMES } from '../../constants';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

/**
 * Volume by Location Chart - Horizontal Bar
 *
 * Y-axis: District (sorted by volume desc)
 * X-axis: Transaction Count
 * Color: Optional - by Region (CCR/RCR/OCR)
 *
 * Supports:
 * - Cross-filtering: clicking a bar filters all other charts
 * - Drill-down: region -> district -> project
 */
export function VolumeByLocationChart({ onCrossFilter, onDrillThrough, height = 350, maxBars = 15 }) {
  const { buildApiParams, drillPath, crossFilter, applyCrossFilter, drillDown } = usePowerBIFilters();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);

  // Fetch data when filters change
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = buildApiParams({
          group_by: drillPath.location,
          metrics: 'count,median_psf,total_value'
        });
        const response = await getAggregate(params);
        // Sort by count descending and take top N
        const sortedData = (response.data.data || [])
          .filter(d => d.count > 0)
          .sort((a, b) => (b.count || 0) - (a.count || 0))
          .slice(0, maxBars);
        setData(sortedData);
      } catch (err) {
        console.error('Error fetching volume by location data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [buildApiParams, drillPath.location, maxBars]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedItem = data[index];
      if (clickedItem) {
        const locationValue = clickedItem[drillPath.location];

        // Apply cross-filter
        if (onCrossFilter) {
          onCrossFilter('location', drillPath.location, locationValue);
        } else {
          applyCrossFilter('location', drillPath.location, locationValue);
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
        const locationValue = clickedItem[drillPath.location];
        drillDown('location', locationValue);
      }
    }
  };

  // Get region color
  const getRegionColor = (location, alpha = 0.8) => {
    if (drillPath.location === 'region') {
      const colors = {
        CCR: `rgba(192, 80, 77, ${alpha})`,  // Red
        RCR: `rgba(79, 129, 189, ${alpha})`, // Blue
        OCR: `rgba(155, 187, 89, ${alpha})`, // Green
      };
      return colors[location] || `rgba(128, 128, 128, ${alpha})`;
    }

    // For district level, color by region
    if (drillPath.location === 'district') {
      const districtNum = parseInt(location?.replace('D', '') || '0');
      if (districtNum >= 1 && districtNum <= 9) {
        return `rgba(192, 80, 77, ${alpha})`; // CCR - Red
      } else if (districtNum >= 10 && districtNum <= 16) {
        return `rgba(79, 129, 189, ${alpha})`; // RCR - Blue
      } else {
        return `rgba(155, 187, 89, ${alpha})`; // OCR - Green
      }
    }

    return `rgba(79, 129, 189, ${alpha})`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-slate-500">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  const getLabel = (item) => {
    const value = item[drillPath.location];
    if (drillPath.location === 'district') {
      return `${value} - ${DISTRICT_NAMES[value] || value}`;
    }
    return value || 'Unknown';
  };

  const labels = data.map(getLabel);
  const counts = data.map(d => d.count || 0);

  // Highlight based on cross-filter
  const highlightedIndex = crossFilter.source === 'location' && crossFilter.value
    ? data.findIndex(d => d[drillPath.location] === crossFilter.value)
    : -1;

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Transaction Count',
        data: counts,
        backgroundColor: data.map((d, i) => {
          const baseColor = getRegionColor(d[drillPath.location]);
          if (highlightedIndex === -1 || highlightedIndex === i) {
            return baseColor;
          }
          return baseColor.replace(/[\d.]+\)$/, '0.3)');
        }),
        borderColor: data.map(d => getRegionColor(d[drillPath.location], 1)),
        borderWidth: 1,
      },
    ],
  };

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleClick,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const item = data[context.dataIndex];
            const lines = [
              `Transactions: ${item.count?.toLocaleString() || 0}`,
            ];
            if (item.median_psf) {
              lines.push(`Median PSF: $${item.median_psf.toLocaleString()}`);
            }
            if (item.total_value) {
              lines.push(`Total Value: $${(item.total_value / 1000000).toFixed(1)}M`);
            }
            return lines;
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Transaction Count',
        },
        ticks: {
          callback: (value) => value.toLocaleString(),
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 11,
          },
        },
      },
    },
  };

  const locationLabels = {
    region: 'Region',
    district: 'District',
    project: 'Project'
  };

  const totalCount = data.reduce((sum, d) => sum + (d.count || 0), 0);

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Volume by {locationLabels[drillPath.location]}</h3>
          <p className="text-xs text-slate-500">
            Top {data.length} by transaction count
            {drillPath.location !== 'project' && (
              <span className="text-blue-500 ml-1">(double-click to drill down)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[rgba(192,80,77,0.8)]"></span>
            <span className="text-slate-500">CCR</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[rgba(79,129,189,0.8)]"></span>
            <span className="text-slate-500">RCR</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[rgba(155,187,89,0.8)]"></span>
            <span className="text-slate-500">OCR</span>
          </div>
        </div>
      </div>
      <div className="p-4" style={{ height }}>
        <Bar ref={chartRef} data={chartData} options={options} />
      </div>
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
        Total: {totalCount.toLocaleString()} transactions across {data.length} {locationLabels[drillPath.location].toLowerCase()}s
      </div>
    </div>
  );
}

export default VolumeByLocationChart;
