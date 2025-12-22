import React, { useEffect, useState, useRef } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { getAggregate } from '../../api/client';
import { DrillButtons } from './DrillButtons';

ChartJS.register(
  ArcElement,
  Title,
  Tooltip,
  Legend
);

/**
 * Bedroom Mix Chart - Donut/Pie
 *
 * Segments: Bedroom Type (1BR, 2BR, 3BR, 4BR, 5+BR)
 * Value: Transaction Count or %
 *
 * Supports:
 * - Cross-filtering: clicking a segment filters all other charts
 */
export function BedroomMixChart({ onCrossFilter, onDrillThrough, height = 280 }) {
  const { buildApiParams, crossFilter, applyCrossFilter, highlight, filters } = usePowerBIFilters();
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
        // ANCHOR CHART: Exclude bedroom filter to show all bedroom types
        // Power BI Best Practice: Same dimension = no interaction
        // Shows all bedroom types with visual highlight on selected
        const params = buildApiParams({
          group_by: 'bedroom',
          metrics: 'count,median_psf,total_value'
        }, { excludeOwnDimension: 'bedroom' });

        const response = await getAggregate(params);
        const sortedData = (response.data.data || [])
          .filter(d => d.bedroom && d.count > 0)
          .sort((a, b) => a.bedroom - b.bedroom);
        setData(sortedData);
        isInitialLoad.current = false;
      } catch (err) {
        console.error('Error fetching bedroom mix data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setUpdating(false);
      }
    };
    fetchData();
  }, [buildApiParams, highlight, filters.bedroomTypes]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedItem = data[index];
      if (clickedItem) {
        const bedroomValue = clickedItem.bedroom;

        // Apply cross-filter (per standard: bedroom segment click = cross-filter)
        // Toggle behavior: clicking same segment again clears the filter
        if (onCrossFilter) {
          onCrossFilter('bedroom', 'bedroom', bedroomValue);
        } else {
          applyCrossFilter('bedroom', 'bedroom', bedroomValue.toString());
        }
      }
    }
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

  const bedroomLabels = {
    1: '1 BR',
    2: '2 BR',
    3: '3 BR',
    4: '4 BR',
    5: '5+ BR',
  };

  const bedroomColors = {
    1: 'rgba(247, 190, 129, 0.9)', // Light orange
    2: 'rgba(79, 129, 189, 0.9)',  // Blue
    3: 'rgba(40, 82, 122, 0.9)',   // Dark blue
    4: 'rgba(17, 43, 60, 0.9)',    // Darkest navy
    5: 'rgba(155, 187, 89, 0.9)',  // Green
  };

  const labels = data.map(d => bedroomLabels[d.bedroom] || `${d.bedroom} BR`);
  const counts = data.map(d => d.count || 0);
  const totalCount = counts.reduce((sum, c) => sum + c, 0);

  // Highlighted bedroom types from sidebar slicer (anchor pattern)
  const highlightedBedroomTypes = filters.bedroomTypes || [];

  // Highlight based on cross-filter (chart click)
  const crossFilterHighlightedIndex = crossFilter.source === 'bedroom' && crossFilter.value
    ? data.findIndex(d => d.bedroom.toString() === crossFilter.value)
    : -1;

  const chartData = {
    labels,
    datasets: [
      {
        data: counts,
        backgroundColor: data.map((d, i) => {
          const color = bedroomColors[d.bedroom] || 'rgba(128, 128, 128, 0.9)';

          // Power BI Anchor Pattern: When bedroom slicer has selection, dim non-selected
          if (highlightedBedroomTypes.length > 0 && !highlightedBedroomTypes.includes(d.bedroom)) {
            return color.replace(/[\d.]+\)$/, '0.25)');
          }

          // Also apply cross-filter dimming if active
          if (crossFilterHighlightedIndex !== -1 && crossFilterHighlightedIndex !== i) {
            return color.replace(/[\d.]+\)$/, '0.3)');
          }
          return color;
        }),
        borderColor: data.map(d => {
          // Thicker/darker border for highlighted bedroom types
          if (highlightedBedroomTypes.length > 0 && highlightedBedroomTypes.includes(d.bedroom)) {
            return 'rgba(33, 52, 72, 1)';  // Dark navy border
          }
          return bedroomColors[d.bedroom]?.replace(/[\d.]+\)$/, '1)') || 'rgba(128, 128, 128, 1)';
        }),
        borderWidth: data.map(d => {
          // Thicker border for highlighted bedroom types
          if (highlightedBedroomTypes.length > 0 && highlightedBedroomTypes.includes(d.bedroom)) {
            return 4;
          }
          return 2;
        }),
        hoverOffset: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleClick,
    cutout: '55%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          padding: 12,
          font: {
            size: 11,
          },
          generateLabels: (chart) => {
            const datasets = chart.data.datasets;
            return chart.data.labels.map((label, i) => {
              const value = datasets[0].data[i];
              const pct = ((value / totalCount) * 100).toFixed(1);
              return {
                text: `${label} (${pct}%)`,
                fillStyle: datasets[0].backgroundColor[i],
                strokeStyle: datasets[0].borderColor[i],
                lineWidth: 2,
                hidden: false,
                index: i,
                pointStyle: 'circle',
              };
            });
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const item = data[context.dataIndex];
            const count = item.count || 0;
            const pct = ((count / totalCount) * 100).toFixed(1);
            const lines = [
              `Transactions: ${count.toLocaleString()} (${pct}%)`,
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
  };

  return (
    <div className={`bg-white rounded-lg border border-slate-200 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800">Bedroom Mix</h3>
            {updating && (
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <DrillButtons hierarchyType="bedroom" />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Transaction distribution by bedroom type
        </p>
      </div>
      <div className="p-4" style={{ height }}>
        <Doughnut ref={chartRef} data={chartData} options={options} />
      </div>
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 text-center">
        Total: {totalCount.toLocaleString()} transactions
        {highlightedBedroomTypes.length > 0 && (
          <span className="ml-1">
            • {highlightedBedroomTypes.map(b => bedroomLabels[b] || `${b} BR`).join(', ')} highlighted
          </span>
        )}
      </div>
    </div>
  );
}

export default BedroomMixChart;
