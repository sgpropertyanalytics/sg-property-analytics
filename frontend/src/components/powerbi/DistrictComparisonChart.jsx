import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  BarController,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import { getAggregate } from '../../api/client';
import {
  assertKnownVersion,
  transformDistrictComparison,
  truncateProjectName,
} from '../../adapters';

// Register Chart.js components
ChartJS.register(
  BarController,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
);

// Color palette - age band differentiated
const COLORS = {
  selected: '#213448',        // Navy - selected project
  sameAgeBand: '#547792',     // Blue - same age cohort
  otherBand: '#94B4C1',       // Sky - other age cohorts
  selectedHover: '#2d4660',
  sameAgeBandHover: '#6889a6',
  otherBandHover: '#a8c5d4',
};

/**
 * District Comparison Chart
 *
 * "How Does This Project Compare?"
 *
 * Horizontal bar chart comparing the selected project's median PSF against
 * other projects in the same district, grouped by age band.
 * Shows selected project's age cohort first, then other age buckets.
 *
 * IMPORTANT: This component does NOT use PowerBIFilterContext.
 * It receives filters as props from the parent component (ProjectDeepDive).
 * This is intentional - PowerBIFilterContext only affects Market Pulse page.
 *
 * @param {string} district - District to fetch projects for (required)
 * @param {string} selectedProject - Project name to highlight (required)
 * @param {number} height - Chart height in pixels (default 400, dynamic based on project count)
 * @param {number} minUnits - Minimum units threshold (default 100)
 */
export function DistrictComparisonChart({
  district,
  selectedProject,
  height: propHeight,
  minUnits = 100,
}) {
  // Create a stable filter key for dependency tracking (no PowerBIFilterContext)
  const filterKey = useMemo(
    () => `${district || ''}:${selectedProject || ''}`,
    [district, selectedProject]
  );

  // Data fetching with useAbortableQuery - automatic abort/stale handling
  const { data: transformedData, loading, error } = useAbortableQuery(
    async (signal) => {
      if (!district) {
        return { groups: [], stats: { maxPsf: 0, minPsf: 0, projectCount: 0, selectedRank: null } };
      }

      const params = {
        group_by: 'project',
        district,
        metrics: 'count,median_psf,total_units',
        limit: 200,
      };

      const response = await getAggregate(params, { signal });

      // Validate API contract version (dev/test only)
      assertKnownVersion(response.data, '/api/aggregate');

      // Transform through adapter - now returns grouped data
      return transformDistrictComparison(response.data, selectedProject, minUnits);
    },
    [filterKey, minUnits],
    { initialData: { groups: [], stats: { maxPsf: 0, minPsf: 0, projectCount: 0, selectedRank: null } } }
  );

  const { groups, stats } = transformedData || { groups: [], stats: {} };

  // Calculate total projects for dynamic height
  const totalProjects = groups.reduce((sum, g) => sum + g.projects.length, 0);
  const sectionHeaders = groups.length;
  const chartHeight = propHeight || Math.max(300, Math.min(800, (totalProjects * 28) + (sectionHeaders * 40)));

  // Flatten groups into chart data with dual category axis (Age Band | Project Name)
  const { labels, flatData, colors, hoverColors, projectMeta } = useMemo(() => {
    const labels = [];
    const flatData = [];
    const colors = [];
    const hoverColors = [];
    const projectMeta = [];

    groups.forEach((group) => {
      // Add projects in this group with dual-axis labels [AgeBand, ProjectName]
      group.projects.forEach((p, idx) => {
        // Show age band label only for first project in each group
        const ageBandLabel = idx === 0 ? group.label : '';
        labels.push([ageBandLabel, truncateProjectName(p.projectName, 24)]);
        flatData.push(p.medianPsf || 0);

        // Color coding
        if (p.isSelected) {
          colors.push(COLORS.selected);
          hoverColors.push(COLORS.selectedHover);
        } else if (group.isSelectedBand) {
          colors.push(COLORS.sameAgeBand);
          hoverColors.push(COLORS.sameAgeBandHover);
        } else {
          colors.push(COLORS.otherBand);
          hoverColors.push(COLORS.otherBandHover);
        }
        projectMeta.push({ project: p, group });
      });
    });

    return { labels, flatData, colors, hoverColors, projectMeta };
  }, [groups]);

  // Prepare Chart.js data
  const chartData = useMemo(() => {
    if (labels.length === 0) {
      return { labels: [], datasets: [] };
    }

    return {
      labels,
      datasets: [
        {
          label: 'Median PSF',
          data: flatData,
          backgroundColor: colors,
          hoverBackgroundColor: hoverColors,
          borderWidth: 0,
          borderRadius: 4,
          barPercentage: 0.75,
        },
      ],
    };
  }, [labels, flatData, colors, hoverColors]);

  // Chart options
  const chartOptions = useMemo(() => ({
    indexAxis: 'y', // Horizontal bars
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (tooltipItem) => {
          // Don't show tooltip for headers and separators
          const meta = projectMeta[tooltipItem.dataIndex];
          return meta && !meta.isHeader && !meta.isSeparator && meta.project;
        },
        callbacks: {
          label: (context) => {
            const meta = projectMeta[context.dataIndex];
            if (!meta || !meta.project) return [];

            const p = meta.project;
            const parts = [`Median PSF: $${p.medianPsf?.toLocaleString() || 'N/A'}`];
            if (p.count) parts.push(`Transactions: ${p.count}`);
            if (p.totalUnits) parts.push(`Total Units: ${p.totalUnits}`);
            if (p.age !== null) parts.push(`Age: ${p.age} years`);
            if (p.isBoutique) parts.push('(Boutique)');

            return parts;
          },
          title: (tooltipItems) => {
            const meta = projectMeta[tooltipItems[0]?.dataIndex];
            return meta?.project?.projectName || '';
          },
        },
        displayColors: false,
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Median PSF ($)',
          color: '#64748b',
          font: { size: 12 },
        },
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: {
          callback: (value) => `$${value.toLocaleString()}`,
          color: '#64748b',
        },
        beginAtZero: false,
      },
      y: {
        title: { display: false },
        grid: { display: false },
        ticks: {
          color: (context) => {
            const meta = projectMeta[context.index];
            if (meta?.isHeader) return '#374151'; // Gray-700 for headers
            if (meta?.project?.isSelected) return COLORS.selected;
            return '#64748b';
          },
          font: (context) => {
            const meta = projectMeta[context.index];
            if (meta?.isHeader) {
              return { weight: 'bold', size: 12 };
            }
            if (meta?.project?.isSelected) {
              return { weight: 'bold', size: 11 };
            }
            return { weight: 'normal', size: 11 };
          },
        },
      },
    },
    layout: {
      padding: { left: 0, right: 20, top: 10, bottom: 10 },
    },
  }), [projectMeta]);

  // Render
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">
          How Does This Project Compare?
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Median PSF vs. projects in {district}, grouped by age
          {stats.selectedRank && stats.selectedAgeBandLabel && (
            <span className="ml-2 text-gray-700 font-medium">
              #{stats.selectedRank} in {stats.selectedAgeBandLabel}
            </span>
          )}
          {stats.projectCount > 0 && (
            <span className="ml-2 text-gray-400">
              ({stats.projectCount} projects, {stats.groupCount} age groups)
            </span>
          )}
        </p>
      </div>

      {/* Chart */}
      <div className="p-4">
        <QueryState
          loading={loading}
          error={error}
          isEmpty={!groups || groups.length === 0}
          emptyMessage={`No projects with ${minUnits}+ units found in ${district}`}
          loadingHeight={chartHeight}
        >
          <div style={{ height: chartHeight }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        </QueryState>
      </div>

      {/* Legend */}
      {groups.length > 0 && !loading && (
        <div className="px-4 pb-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: COLORS.selected }}
            />
            <span>Selected Project</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: COLORS.sameAgeBand }}
            />
            <span>Same Age Cohort</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: COLORS.otherBand }}
            />
            <span>Other Age Cohorts</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default DistrictComparisonChart;
