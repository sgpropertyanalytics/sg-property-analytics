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
import { DISTRICT_NAMES, getRegionForDistrict } from '../../constants';
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
 * - Drill-down: region -> district (global hierarchy stops here)
 * - Project view: At district level, clicking a district shows projects (LOCAL view)
 *   - Clicking a project opens ProjectDetailPanel (does NOT affect other charts)
 */
export function VolumeByLocationChart({ onCrossFilter, onDrillThrough, height = 350, maxBars = 15 }) {
  const {
    buildApiParams,
    drillPath,
    crossFilter,
    applyCrossFilter,
    drillDown,
    breadcrumbs,
    highlight,
    setSelectedProject,
    filters,  // Access filters.segment for anchor chart highlighting
  } = usePowerBIFilters();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const isInitialLoad = useRef(true);

  // LOCAL STATE: Show projects for a specific district (drill-through, not global)
  // When set, the chart shows projects for this district instead of the global drill level
  const [showProjectsForDistrict, setShowProjectsForDistrict] = useState(null);

  // Determine what we're displaying: global drill level OR local project view
  const displayMode = showProjectsForDistrict ? 'project' : drillPath.location;

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
        // Build params based on display mode
        let params;
        if (showProjectsForDistrict) {
          // LOCAL PROJECT VIEW: Show projects in selected district
          params = buildApiParams({
            group_by: 'project',
            metrics: 'count,median_psf,total_value',
            district: showProjectsForDistrict, // Filter to this district
          });
        } else if (drillPath.location === 'region') {
          // ANCHOR CHART: At region level, exclude segment filter
          // Power BI Best Practice: Same dimension = no interaction
          // Shows all regions (CCR, RCR, OCR) with visual highlight on selected
          params = buildApiParams({
            group_by: 'region',
            metrics: 'count,median_psf,total_value'
          }, { excludeOwnDimension: 'segment' });
        } else {
          // GLOBAL DRILL VIEW: Show districts (apply all filters)
          params = buildApiParams({
            group_by: drillPath.location,
            metrics: 'count,median_psf,total_value'
          });
        }

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
  }, [buildApiParams, drillPath.location, maxBars, highlight, showProjectsForDistrict, filters.segment]);

  // Clear local project view when global drill changes
  useEffect(() => {
    setShowProjectsForDistrict(null);
  }, [drillPath.location]);

  const handleClick = (event) => {
    const chart = chartRef.current;
    if (!chart) return;

    const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedItem = data[index];
      if (clickedItem) {
        if (showProjectsForDistrict) {
          // SHOWING PROJECTS: Click opens ProjectDetailPanel (does NOT affect other charts)
          const projectName = clickedItem.project;
          if (projectName) {
            setSelectedProject(projectName, showProjectsForDistrict);
          }
        } else if (drillPath.location === 'region') {
          // AT REGION LEVEL: Click drills down to district (global)
          const regionValue = clickedItem.region;
          drillDown('location', regionValue, regionValue);
        } else if (drillPath.location === 'district') {
          // AT DISTRICT LEVEL: Click shows projects for that district (LOCAL view)
          const districtValue = clickedItem.district;
          setShowProjectsForDistrict(districtValue);
        }
      }
    }
  };

  // Handle back button from project view
  const handleBackFromProjects = () => {
    setShowProjectsForDistrict(null);
  };

  // Determine if this region is highlighted by the segment slicer
  // Power BI Best Practice: Anchor charts show full distribution, highlight selected
  const highlightedSegment = filters.segment;

  // Get region color using theme palette
  // When a segment is selected in the slicer, non-selected segments get reduced opacity
  const getRegionColor = (location, alpha = 0.8, isForBackground = true) => {
    if (displayMode === 'region') {
      const colors = {
        CCR: `rgba(33, 52, 72, ${alpha})`,   // #213448 - Dark navy
        RCR: `rgba(84, 119, 146, ${alpha})`, // #547792 - Medium blue
        OCR: `rgba(148, 180, 193, ${alpha})`, // #94B4C1 - Light blue
      };
      let color = colors[location] || `rgba(128, 128, 128, ${alpha})`;

      // Power BI Anchor Pattern: When segment slicer is active, dim non-selected regions
      if (isForBackground && highlightedSegment && location !== highlightedSegment) {
        // Reduce opacity for non-highlighted segments
        return color.replace(/[\d.]+\)$/, '0.25)');
      }
      return color;
    }

    // For district level, color by region using centralized mapping
    if (displayMode === 'district') {
      const region = getRegionForDistrict(location);
      const colors = {
        CCR: `rgba(33, 52, 72, ${alpha})`,   // #213448 - Dark navy
        RCR: `rgba(84, 119, 146, ${alpha})`, // #547792 - Medium blue
        OCR: `rgba(148, 180, 193, ${alpha})`, // #94B4C1 - Light blue
      };
      return colors[region] || colors.OCR;
    }

    // For project level (local view), use consistent color
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
    if (showProjectsForDistrict) {
      // Showing projects
      const value = item.project;
      if (value && value.length > 30) {
        return value.substring(0, 27) + '...';
      }
      return value || 'Unknown';
    }

    const value = item[drillPath.location];
    if (drillPath.location === 'district') {
      const areaName = DISTRICT_NAMES[value];
      if (areaName) {
        // Truncate area name if too long
        const shortName = areaName.split(',')[0].substring(0, 20);
        return `${value} (${shortName}${shortName !== areaName.split(',')[0] ? '...' : ''})`;
      }
      return value;
    }
    return value || 'Unknown';
  };

  const labels = data.map(getLabel);
  const counts = data.map(d => d.count || 0);

  // Highlight based on cross-filter (when user clicks a bar)
  const groupByField = showProjectsForDistrict ? 'project' : drillPath.location;
  const crossFilterHighlightedIndex = crossFilter.source === 'location' && crossFilter.value
    ? data.findIndex(d => d[groupByField] === crossFilter.value)
    : -1;

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Transaction Count',
        data: counts,
        backgroundColor: data.map((d, i) => {
          const locationValue = showProjectsForDistrict ? d.project : d[drillPath.location];

          // At region level with segment slicer: anchor pattern applies
          // getRegionColor already handles the dimming of non-selected segments
          const baseColor = getRegionColor(locationValue, 0.8, true);

          // If there's also a cross-filter active (bar click), apply additional dimming
          if (crossFilterHighlightedIndex !== -1 && crossFilterHighlightedIndex !== i) {
            return baseColor.replace(/[\d.]+\)$/, '0.3)');
          }
          return baseColor;
        }),
        borderColor: data.map((d, i) => {
          const locationValue = showProjectsForDistrict ? d.project : d[drillPath.location];

          // At region level: thicker border for highlighted segment
          if (displayMode === 'region' && highlightedSegment === locationValue) {
            return 'rgba(33, 52, 72, 1)';  // Dark navy border for highlighted
          }
          return getRegionColor(locationValue, 1, false);
        }),
        borderWidth: data.map((d) => {
          const locationValue = showProjectsForDistrict ? d.project : d[drillPath.location];
          // Thicker border for highlighted segment in anchor mode
          if (displayMode === 'region' && highlightedSegment === locationValue) {
            return 3;
          }
          return 1;
        }),
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
    region: 'Segment',
    district: 'District',
    project: 'Project'
  };

  const totalCount = data.reduce((sum, d) => sum + (d.count || 0), 0);

  // Build contextual footer message based on breadcrumbs
  const getContextMessage = () => {
    const levelName = locationLabels[displayMode].toLowerCase();
    const count = data.length;
    const base = `Total: ${totalCount.toLocaleString()} transactions across ${count} ${levelName}${count !== 1 ? 's' : ''}`;

    if (showProjectsForDistrict) {
      // Showing projects in a specific district
      const districtName = DISTRICT_NAMES[showProjectsForDistrict] || showProjectsForDistrict;
      const shortName = districtName.split(',')[0];
      return `${base} in ${showProjectsForDistrict} (${shortName})`;
    }

    // At region level with segment filter: show anchor pattern message
    if (displayMode === 'region' && highlightedSegment) {
      return `${base} • ${highlightedSegment} highlighted`;
    }

    // Add parent context from breadcrumbs
    if (breadcrumbs.location.length === 0) {
      return base; // At top level (region), no parent context
    } else if (drillPath.location === 'district' && breadcrumbs.location.length >= 1) {
      // At district level, show region context
      const region = breadcrumbs.location[0]?.label || breadcrumbs.location[0]?.value;
      return `${base} in ${region}`;
    }
    return base;
  };

  // Get title based on display mode
  const getTitle = () => {
    if (showProjectsForDistrict) {
      return `Projects in ${showProjectsForDistrict}`;
    }
    return `Volume by ${locationLabels[drillPath.location]}`;
  };

  // Get click hint based on display mode
  const getClickHint = () => {
    if (showProjectsForDistrict) {
      return '(click to view project details)';
    }
    if (drillPath.location === 'region') {
      return '(click to drill down)';
    }
    if (drillPath.location === 'district') {
      return '(click to view projects)';
    }
    return null;
  };

  return (
    <div className={`bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden transition-opacity duration-150 ${updating ? 'opacity-70' : ''}`}>
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showProjectsForDistrict && (
              <button
                onClick={handleBackFromProjects}
                className="p-1 hover:bg-[#EAE0CF] rounded transition-colors"
                title="Back to districts"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#547792]">
                  <path d="M10 12L6 8l4-4" />
                </svg>
              </button>
            )}
            <h3 className="font-semibold text-[#213448]">{getTitle()}</h3>
            {updating && (
              <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          {!showProjectsForDistrict && (
            <DrillButtons hierarchyType="location" />
          )}
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-[#547792]">
            Top {data.length} by transaction count
            {getClickHint() && (
              <span className="text-[#547792] font-medium ml-1">{getClickHint()}</span>
            )}
          </p>
          {!showProjectsForDistrict && (
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
          )}
        </div>
      </div>
      <div className="p-4" style={{ height }}>
        <Bar ref={chartRef} data={chartData} options={options} />
      </div>
      <div className="px-4 py-2 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30 text-xs text-[#547792]">
        {getContextMessage()}
      </div>
    </div>
  );
}

export default VolumeByLocationChart;
