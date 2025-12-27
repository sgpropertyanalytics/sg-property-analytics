/**
 * Supply Waterfall Adapter
 *
 * Transforms API response into Chart.js waterfall format.
 * ALL spacer bar math is computed here - the chart component only renders.
 *
 * Waterfall Bar Structure:
 * - Each segment has a transparent "spacer" bar that positions it
 * - The visible bar sits on top of the spacer
 * - This creates the "floating" waterfall effect
 *
 * OUTPUT STRUCTURE:
 * {
 *   labels: ['CCR', 'RCR', 'OCR', 'Total'],
 *   datasets: [...],  // Pre-computed with spacers
 *   totals: { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply },
 *   displayMeta: {
 *     subtitle: "Unsold + Upcoming + GLS Pipeline",
 *     asOf: "Dec 27, 2025",
 *     launchYear: 2026,
 *     includesGls: true
 *   }
 * }
 *
 * RULE: Chart component receives this and renders. No math in component.
 */

import { REGIONS } from '../../constants';

// Colors from design system
const COLORS = {
  unsoldInventory: '#213448',  // Deep Navy
  upcomingLaunches: '#547792', // Ocean Blue
  glsPipeline: '#94B4C1',      // Sky Blue
  glsExcluded: 'rgba(148, 180, 193, 0.3)',  // Sky Blue @ 30% opacity
  total: '#EAE0CF',            // Sand/Cream
  spacer: 'transparent',       // Invisible spacer
};

// Border colors for better definition
const BORDER_COLORS = {
  unsoldInventory: '#1a2936',
  upcomingLaunches: '#456680',
  glsPipeline: '#7a9dab',
  glsExcluded: 'rgba(122, 157, 171, 0.5)',
  total: '#d4c9b8',
};

/**
 * Format date string to readable format
 * @param {string} isoDate - ISO date string (YYYY-MM-DD)
 * @returns {string} Formatted date (e.g., "Dec 27, 2025")
 */
const formatDate = (isoDate) => {
  if (!isoDate) return 'N/A';
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/**
 * Transform API response to Chart.js regional waterfall format.
 *
 * Creates a stacked bar chart where:
 * - Each label (CCR, RCR, OCR, Total) has 4 bar segments
 * - Segments are: Spacer + Unsold + Upcoming + GLS
 * - Spacer is transparent to position the stack
 *
 * @param {Object} apiResponse - Response from /api/supply/summary
 * @param {Object} options - Transform options
 * @param {boolean} options.includeGls - Whether GLS is included in calculations
 * @returns {Object} Chart.js compatible data structure
 */
export function transformRegionalWaterfall(apiResponse, options = {}) {
  const { includeGls = true } = options;
  const { byRegion, totals, meta } = apiResponse;

  // Fixed order: CCR → RCR → OCR → Total
  const labels = [...REGIONS, 'Total'];

  // Build datasets with spacer bars
  const datasets = buildWaterfallDatasets(byRegion, totals, includeGls);

  return {
    labels,
    datasets,
    totals,
    displayMeta: {
      subtitle: includeGls
        ? 'Unsold Inventory + Upcoming Launches + GLS Pipeline'
        : 'Unsold Inventory + Upcoming Launches',
      asOf: formatDate(meta?.asOfDate),
      launchYear: meta?.launchYear || 2026,
      includesGls: includeGls,
    },
  };
}

/**
 * Transform API response to Chart.js district waterfall format.
 *
 * Shows district-level breakdown for a selected region.
 *
 * @param {Object} apiResponse - Response from /api/supply/summary
 * @param {string} selectedRegion - CCR, RCR, or OCR
 * @param {Object} options - Transform options
 * @returns {Object} Chart.js compatible data structure
 */
export function transformDistrictWaterfall(apiResponse, selectedRegion, options = {}) {
  const { includeGls = true } = options;
  const { byDistrict, meta } = apiResponse;

  // Filter districts by selected region
  const regionDistricts = Object.entries(byDistrict)
    .filter(([, data]) => data.region === selectedRegion)
    .sort(([a], [b]) => a.localeCompare(b)); // D01, D02, ...

  if (regionDistricts.length === 0) {
    return {
      labels: [],
      datasets: [],
      totals: { unsoldInventory: 0, upcomingLaunches: 0, glsPipeline: 0, totalEffectiveSupply: 0 },
      displayMeta: {
        subtitle: `No districts in ${selectedRegion}`,
        asOf: formatDate(meta?.asOfDate),
        launchYear: meta?.launchYear || 2026,
        includesGls: includeGls,
      },
    };
  }

  const labels = regionDistricts.map(([district]) => district);

  // Build data arrays
  const unsoldData = regionDistricts.map(([, data]) => data.unsoldInventory);
  const upcomingData = regionDistricts.map(([, data]) => data.upcomingLaunches);
  // Note: GLS is region-level only, so district glsPipeline is always 0

  // Calculate region totals from district data
  const regionTotals = {
    unsoldInventory: unsoldData.reduce((a, b) => a + b, 0),
    upcomingLaunches: upcomingData.reduce((a, b) => a + b, 0),
    glsPipeline: 0, // District level has no GLS
    totalEffectiveSupply: 0,
  };
  regionTotals.totalEffectiveSupply = regionTotals.unsoldInventory + regionTotals.upcomingLaunches;

  // For district view, we use simple stacked bar (no waterfall spacers needed)
  const datasets = [
    {
      label: 'Unsold Inventory',
      data: unsoldData,
      backgroundColor: COLORS.unsoldInventory,
      borderColor: BORDER_COLORS.unsoldInventory,
      borderWidth: 1,
      stack: 'supply',
    },
    {
      label: 'Upcoming Launches',
      data: upcomingData,
      backgroundColor: COLORS.upcomingLaunches,
      borderColor: BORDER_COLORS.upcomingLaunches,
      borderWidth: 1,
      stack: 'supply',
    },
  ];

  return {
    labels,
    datasets,
    totals: regionTotals,
    displayMeta: {
      subtitle: `${selectedRegion} District Breakdown`,
      asOf: formatDate(meta?.asOfDate),
      launchYear: meta?.launchYear || 2026,
      includesGls: false, // Districts don't have GLS
      selectedRegion,
    },
  };
}

/**
 * Build waterfall datasets with spacer bars.
 *
 * The waterfall effect is created by stacking:
 * 1. Spacer (transparent) - positions the stack at correct height
 * 2. Unsold Inventory (navy)
 * 3. Upcoming Launches (blue)
 * 4. GLS Pipeline (sky blue / grey if excluded)
 *
 * For the "Total" bar, we use the grand total value directly.
 *
 * @param {Object} byRegion - Region data from API
 * @param {Object} totals - Total values from API
 * @param {boolean} includeGls - Whether GLS is included
 * @returns {Array} Chart.js datasets
 */
function buildWaterfallDatasets(byRegion, totals, includeGls) {
  // Order of bars: CCR, RCR, OCR, Total
  const regions = REGIONS;

  // Extract values for each region
  const unsoldValues = regions.map((r) => byRegion[r]?.unsoldInventory || 0);
  const upcomingValues = regions.map((r) => byRegion[r]?.upcomingLaunches || 0);
  const glsValues = regions.map((r) =>
    includeGls ? (byRegion[r]?.glsPipeline || 0) : 0
  );

  // Add Total column values
  unsoldValues.push(0);     // Total bar doesn't show stacked segments
  upcomingValues.push(0);
  glsValues.push(0);

  // Calculate spacer heights for waterfall effect
  // For regions: spacer = 0 (bars start from bottom)
  // This creates a simple stacked bar for each region
  const spacerValues = regions.map(() => 0);
  spacerValues.push(0); // Total also starts from 0

  // Total bar is special - it shows the grand total as a single bar
  const totalBarValues = regions.map(() => 0);
  totalBarValues.push(totals?.totalEffectiveSupply || 0);

  return [
    // Spacer (invisible, positions the stack)
    {
      label: 'Spacer',
      data: spacerValues,
      backgroundColor: COLORS.spacer,
      borderWidth: 0,
      stack: 'supply',
      skipNull: true,
    },
    // Unsold Inventory (bottom segment for regions)
    {
      label: 'Unsold Inventory',
      data: unsoldValues,
      backgroundColor: COLORS.unsoldInventory,
      borderColor: BORDER_COLORS.unsoldInventory,
      borderWidth: 1,
      stack: 'supply',
    },
    // Upcoming Launches (middle segment)
    {
      label: 'Upcoming Launches',
      data: upcomingValues,
      backgroundColor: COLORS.upcomingLaunches,
      borderColor: BORDER_COLORS.upcomingLaunches,
      borderWidth: 1,
      stack: 'supply',
    },
    // GLS Pipeline (top segment - grey when excluded)
    {
      label: includeGls ? 'GLS Pipeline' : 'GLS Pipeline (excluded)',
      data: glsValues,
      backgroundColor: includeGls ? COLORS.glsPipeline : COLORS.glsExcluded,
      borderColor: includeGls ? BORDER_COLORS.glsPipeline : BORDER_COLORS.glsExcluded,
      borderWidth: 1,
      stack: 'supply',
      // When excluded, show tooltip indicating it's excluded
      excluded: !includeGls,
    },
    // Total bar (separate stack)
    {
      label: 'Total Effective Supply',
      data: totalBarValues,
      backgroundColor: COLORS.total,
      borderColor: BORDER_COLORS.total,
      borderWidth: 2,
      stack: 'total', // Different stack so it doesn't combine with segments
    },
  ];
}

/**
 * Get tooltip content for a waterfall bar.
 *
 * @param {Object} context - Chart.js tooltip context
 * @param {Object} apiResponse - Original API response for detailed data
 * @param {boolean} includeGls - Whether GLS is included
 * @returns {string[]} Tooltip lines
 */
export function getWaterfallTooltip(context, apiResponse, includeGls) {
  const { datasetIndex, dataIndex, dataset, chart } = context;
  const label = chart.data.labels[dataIndex];
  const datasetLabel = dataset.label;
  const value = dataset.data[dataIndex];

  // Skip spacer tooltips
  if (datasetLabel === 'Spacer' || value === 0) {
    return [];
  }

  const lines = [];

  if (label === 'Total') {
    // Total bar tooltip
    lines.push('Total Effective Supply');
    lines.push('─────────────────────');
    lines.push(`${formatNumber(value)} units`);
    lines.push('');
    if (includeGls) {
      lines.push('= Unsold + Upcoming + GLS');
    } else {
      lines.push('= Unsold + Upcoming');
      lines.push('(GLS excluded)');
    }
  } else {
    // Region bar tooltip
    const regionData = apiResponse?.byRegion?.[label];
    if (regionData) {
      lines.push(`${label} Supply Pipeline`);
      lines.push('─────────────────────');
      lines.push(`Unsold Inventory:    ${formatNumber(regionData.unsoldInventory)} units`);
      lines.push(`Upcoming Launches:   ${formatNumber(regionData.upcomingLaunches)} units`);
      if (includeGls) {
        lines.push(`GLS Pipeline:        ${formatNumber(regionData.glsPipeline)} units`);
      } else {
        lines.push(`GLS Pipeline:        0 (excluded)`);
      }
      lines.push('─────────────────────');
      lines.push(`Total Effective:    ${formatNumber(regionData.totalEffectiveSupply)} units`);
    }
  }

  return lines;
}

/**
 * Format number with thousand separators.
 */
function formatNumber(value) {
  if (value === null || value === undefined) return '0';
  return value.toLocaleString('en-US');
}

/**
 * Get chart options for the waterfall chart.
 *
 * @param {Function} onBarClick - Callback when a bar is clicked
 * @param {Object} apiResponse - API response for tooltips
 * @param {boolean} includeGls - Whether GLS is included
 * @returns {Object} Chart.js options
 */
export function getWaterfallChartOptions(onBarClick, apiResponse, includeGls) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: true,
      mode: 'nearest',
    },
    onClick: (event, elements) => {
      if (elements.length > 0 && onBarClick) {
        const { index } = elements[0];
        const label = event.chart.data.labels[index];
        // Don't trigger click for Total bar
        if (label !== 'Total' && REGIONS.includes(label)) {
          onBarClick(label);
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          filter: (item) => item.text !== 'Spacer', // Hide spacer from legend
          usePointStyle: true,
          padding: 16,
        },
      },
      tooltip: {
        enabled: true,
        callbacks: {
          title: () => '', // We build custom title in label callback
          label: (context) => {
            const lines = getWaterfallTooltip(context, apiResponse, includeGls);
            return lines.length > 0 ? lines : null;
          },
        },
        displayColors: false,
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        padding: 12,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12, family: 'monospace' },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          font: { size: 12, weight: '500' },
          color: '#213448',
        },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: {
          color: 'rgba(148, 180, 193, 0.2)',
        },
        ticks: {
          callback: (value) => formatNumber(value),
          font: { size: 11 },
          color: '#547792',
        },
        title: {
          display: true,
          text: 'Units',
          font: { size: 12 },
          color: '#547792',
        },
      },
    },
  };
}

export default {
  transformRegionalWaterfall,
  transformDistrictWaterfall,
  getWaterfallTooltip,
  getWaterfallChartOptions,
};
