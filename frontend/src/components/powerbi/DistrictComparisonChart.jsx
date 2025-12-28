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

// Color palette
const COLORS = {
  selected: '#213448', // Navy - selected project
  other: '#94B4C1',    // Sky - other projects
  selectedHover: '#2d4660',
  otherHover: '#a8c5d4',
};

/**
 * District Comparison Chart
 *
 * "How Does This Project Compare?"
 *
 * Horizontal bar chart comparing the selected project's median PSF against
 * other projects in the same district (100+ units, excluding boutiques).
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
        return { projects: [], stats: { maxPsf: 0, minPsf: 0, projectCount: 0, selectedRank: null } };
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

      // Transform through adapter
      return transformDistrictComparison(response.data, selectedProject, minUnits);
    },
    [filterKey, minUnits],
    { initialData: { projects: [], stats: { maxPsf: 0, minPsf: 0, projectCount: 0, selectedRank: null } } }
  );

  const { projects, stats } = transformedData || { projects: [], stats: {} };

  // Dynamic height based on project count
  const chartHeight = propHeight || Math.max(300, Math.min(600, projects.length * 28));

  // Prepare Chart.js data
  const chartData = useMemo(() => {
    if (!projects || projects.length === 0) {
      return { labels: [], datasets: [] };
    }

    return {
      labels: projects.map((p) => truncateProjectName(p.projectName, 28)),
      datasets: [
        {
          label: 'Median PSF',
          data: projects.map((p) => p.medianPsf || 0),
          backgroundColor: projects.map((p) =>
            p.isSelected ? COLORS.selected : COLORS.other
          ),
          hoverBackgroundColor: projects.map((p) =>
            p.isSelected ? COLORS.selectedHover : COLORS.otherHover
          ),
          borderWidth: 0,
          borderRadius: 4,
          barPercentage: 0.8,
        },
      ],
    };
  }, [projects]);

  // Chart options
  const chartOptions = useMemo(() => ({
    indexAxis: 'y', // Horizontal bars
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const project = projects[context.dataIndex];
            const psf = project?.medianPsf;
            const count = project?.count;
            const units = project?.totalUnits;

            const parts = [`Median PSF: $${psf?.toLocaleString() || 'N/A'}`];
            if (count) parts.push(`Transactions: ${count}`);
            if (units) parts.push(`Total Units: ${units}`);
            if (project?.isBoutique) parts.push('(Boutique)');

            return parts;
          },
          title: (tooltipItems) => {
            const project = projects[tooltipItems[0]?.dataIndex];
            return project?.projectName || '';
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
            const project = projects[context.index];
            return project?.isSelected ? COLORS.selected : '#64748b';
          },
          font: (context) => {
            const project = projects[context.index];
            return {
              weight: project?.isSelected ? 'bold' : 'normal',
              size: 11,
            };
          },
        },
      },
    },
    layout: {
      padding: { left: 0, right: 20, top: 10, bottom: 10 },
    },
  }), [projects]);

  // Render
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">
          How Does This Project Compare?
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Median PSF vs. other projects in {district} (100+ units)
          {stats.selectedRank && stats.projectCount && (
            <span className="ml-2 text-gray-700 font-medium">
              #{stats.selectedRank} of {stats.projectCount}
            </span>
          )}
        </p>
      </div>

      {/* Chart */}
      <div className="p-4">
        <QueryState
          loading={loading}
          error={error}
          isEmpty={!projects || projects.length === 0}
          emptyMessage={`No projects with ${minUnits}+ units found in ${district}`}
          loadingHeight={chartHeight}
        >
          <div style={{ height: chartHeight }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        </QueryState>
      </div>

      {/* Legend/footnote */}
      {projects.length > 0 && !loading && (
        <div className="px-4 pb-3 flex items-center gap-4 text-xs text-gray-500">
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
              style={{ backgroundColor: COLORS.other }}
            />
            <span>Other Projects</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default DistrictComparisonChart;
