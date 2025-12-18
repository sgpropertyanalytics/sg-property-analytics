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
import { DrillButtons } from './DrillButtons';

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
        isInitialLoad.current = false;
      } catch (err) {
        console.error('Error fetching volume by location data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setUpdating(false);
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

  // Get region color using theme palette
  const getRegionColor = (location, alpha = 0.8) => {
    if (drillPath.location === 'region') {
      const colors = {
        CCR: `rgba(33, 52, 72, ${alpha})`,   // #213448 - Dark navy
        RCR: `rgba(84, 119, 146, ${alpha})`, // #547792 - Medium blue
        OCR: `rgba(148, 180, 193, ${alpha})`, // #94B4C1 - Light blue
      };
      return colors[location] || `rgba(128, 128, 128, ${alpha})`;
    }

    // For district level, color by region
    if (drillPath.location === 'district') {
      const districtNum = parseInt(location?.replace('D', '') || '0');
      if (districtNum >= 1 && districtNum <= 9) {
        return `rgba(33, 52, 72, ${alpha})`;   // CCR - #213448
      } else if (districtNum >= 10 && districtNum <= 16) {
        return `rgba(84, 119, 146, ${alpha})`;  // RCR - #547792
      } else {
        return `rgba(148, 180, 193, ${alpha})`; // OCR - #94B4C1
      }
    }

    return `rgba(84, 119, 146, ${alpha})`;
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

  const getLabel = (item) => {
    const value = item[drillPath.location];
    if (drillPath.location === 'district') {
      const areaName = DISTRICT_NAMES[value];
      if (areaName) {
        // Truncate area name if too long (keep first part before comma or limit to 20 chars)
        const shortName = areaName.split(',')[0].substring(0, 20);
        return `${value} (${shortName}${shortName !== areaName.split(',')[0] ? '...' : ''})`;
      }
      return value;
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
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[#213448]">Volume by {locationLabels[drillPath.location]}</h3>
            {updating && (
              <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <DrillButtons hierarchyType="location" />
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-[#547792]">
            Top {data.length} by transaction count
            {drillPath.location !== 'project' && (
              <span className="text-[#547792] font-medium ml-1">(click to drill down)</span>
            )}
          </p>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#213448]"></span>
              <span className="text-[#547792]">CCR</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#547792]"></span>
              <span className="text-[#547792]">RCR</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#94B4C1]"></span>
              <span className="text-[#547792]">OCR</span>
            </div>
          </div>
        </div>
      </div>
      <div className="p-4" style={{ height }}>
        <Bar ref={chartRef} data={chartData} options={options} />
      </div>
      <div className="px-4 py-2 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 text-xs text-[#547792]">
        Total: {totalCount.toLocaleString()} transactions across {data.length} {locationLabels[drillPath.location].toLowerCase()}s
      </div>
    </div>
  );
}

export default VolumeByLocationChart;
