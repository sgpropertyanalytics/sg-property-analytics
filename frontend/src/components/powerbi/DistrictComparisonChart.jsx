import React, { useMemo } from 'react';
// Chart.js components registered globally in chartSetup.js
import { Bar } from 'react-chartjs-2';
import { useAbortableQuery } from '../../hooks';
import { QueryState } from '../common/QueryState';
import { getAggregate } from '../../api/client';
import {
  assertKnownVersion,
  transformDistrictComparison,
  truncateProjectName,
} from '../../adapters';
import { CHART_AXIS_DEFAULTS } from '../../constants/chartOptions';

// Color palette - age band differentiated
const COLORS = {
  selected: '#213448',        // Navy - selected project
  sameAgeBand: '#547792',     // Blue - same age cohort
  otherBand: '#94B4C1',       // Sky - other age cohorts
  selectedHover: '#2d4660',
  sameAgeBandHover: '#6889a6',
  otherBandHover: '#a8c5d4',
};

// Row height for alignment between table and chart
const ROW_HEIGHT = 28;

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
export const DistrictComparisonChart = React.memo(function DistrictComparisonChart({
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
    { initialData: { groups: [], stats: { maxPsf: 0, minPsf: 0, projectCount: 0, selectedRank: null } }, keepPreviousData: true }
  );

  const { groups, stats } = transformedData || { groups: [], stats: {} };

  // Calculate total projects for dynamic height
  const totalProjects = groups.reduce((sum, g) => sum + g.projects.length, 0);
  const chartHeight = propHeight || Math.max(300, Math.min(800, totalProjects * ROW_HEIGHT + 60));

  // Flatten groups into rows for table + chart alignment
  const { rows, chartLabels, chartData, chartColors, chartHoverColors } = useMemo(() => {
    const rows = [];
    const chartLabels = [];
    const chartData = [];
    const chartColors = [];
    const chartHoverColors = [];

    groups.forEach((group) => {
      group.projects.forEach((p, idx) => {
        // Age band label only on first row of each group
        const ageBandLabel = idx === 0 ? group.label : '';
        const rowSpan = idx === 0 ? group.projects.length : 0;

        // Determine colors
        let bgColor, hoverColor;
        if (p.isSelected) {
          bgColor = COLORS.selected;
          hoverColor = COLORS.selectedHover;
        } else if (group.isSelectedBand) {
          bgColor = COLORS.sameAgeBand;
          hoverColor = COLORS.sameAgeBandHover;
        } else {
          bgColor = COLORS.otherBand;
          hoverColor = COLORS.otherBandHover;
        }

        rows.push({
          ageBandLabel,
          rowSpan,
          projectName: p.projectName,
          medianPsf: p.medianPsf,
          isSelected: p.isSelected,
          isSelectedBand: group.isSelectedBand,
          project: p,
          group,
          bgColor,
        });

        // Chart data (simple labels, bars only)
        chartLabels.push(truncateProjectName(p.projectName, 20));
        chartData.push(p.medianPsf || 0);
        chartColors.push(bgColor);
        chartHoverColors.push(hoverColor);
      });
    });

    return { rows, chartLabels, chartData, chartColors, chartHoverColors };
  }, [groups]);

  // Prepare Chart.js data (bars only, no Y-axis labels - table handles that)
  const barChartData = useMemo(() => {
    if (chartLabels.length === 0) {
      return { labels: [], datasets: [] };
    }

    return {
      labels: chartLabels,
      datasets: [
        {
          label: 'Median PSF',
          data: chartData,
          backgroundColor: chartColors,
          hoverBackgroundColor: chartHoverColors,
          borderWidth: 0,
          borderRadius: 4,
          barPercentage: 0.85,
          categoryPercentage: 0.95,
        },
      ],
    };
  }, [chartLabels, chartData, chartColors, chartHoverColors]);

  // Chart options - hide Y-axis labels (table provides them)
  const chartOptions = useMemo(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const row = rows[context.dataIndex];
            if (!row) return [];

            const p = row.project;
            const parts = [`Median PSF: $${p.medianPsf?.toLocaleString() || 'N/A'}`];
            if (p.count) parts.push(`Transactions: ${p.count}`);
            if (p.totalUnits) parts.push(`Total Units: ${p.totalUnits}`);
            if (p.age !== null && p.age !== undefined) parts.push(`Age: ${p.age} years`);
            if (p.isBoutique) parts.push('(Boutique)');

            return parts;
          },
          title: (tooltipItems) => {
            const row = rows[tooltipItems[0]?.dataIndex];
            return row?.projectName || '';
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
          ...CHART_AXIS_DEFAULTS.title,
        },
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: {
          ...CHART_AXIS_DEFAULTS.ticks,
          callback: (value) => `$${value.toLocaleString()}`,
        },
        beginAtZero: false,
      },
      y: {
        display: false, // Hide Y-axis - table provides labels
      },
    },
    layout: {
      padding: { left: 0, right: 20, top: 0, bottom: 0 },
    },
  }), [rows]);

  // Calculate the actual bar area height (excluding X-axis)
  const barAreaHeight = rows.length * ROW_HEIGHT;

  // Render
  return (
    <div className="bg-card rounded-lg border border-[#94B4C1]/50 shadow-sm overflow-hidden">
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

      {/* Chart with dual-column labels */}
      <div className="p-4">
        <QueryState
          loading={loading}
          error={error}
          isEmpty={!groups || groups.length === 0}
          emptyMessage={`No projects with ${minUnits}+ units found in ${district}`}
          loadingHeight={chartHeight}
        >
          {/* Column headers */}
          <div className="flex mb-1 text-xs font-medium text-gray-500 border-b border-gray-100 pb-1">
            <div className="w-24 shrink-0 pl-1">Age Band</div>
            <div className="w-40 shrink-0">Project</div>
            <div className="flex-1 text-center">Median PSF</div>
          </div>

          {/* Dual-column table + chart layout */}
          <div className="flex">
            {/* Left: Two-column table (Age Band | Project Name) */}
            <div
              className="shrink-0 flex flex-col"
              style={{ height: barAreaHeight }}
            >
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className="flex items-center border-b border-gray-50"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Age Band column */}
                  <div
                    className={`w-24 shrink-0 text-xs pl-1 pr-2 truncate ${
                      row.ageBandLabel ? 'font-semibold text-gray-700' : 'text-transparent'
                    }`}
                  >
                    {row.ageBandLabel || '-'}
                  </div>

                  {/* Project Name column */}
                  <div
                    className={`w-40 shrink-0 text-xs pr-2 truncate ${
                      row.isSelected ? 'font-bold text-gray-900' : 'text-gray-600'
                    }`}
                    title={row.projectName}
                  >
                    {truncateProjectName(row.projectName, 22)}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Chart bars only */}
            <div className="flex-1 min-w-0" style={{ height: chartHeight }}>
              <Bar data={barChartData} options={chartOptions} />
            </div>
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
});

export default DistrictComparisonChart;
