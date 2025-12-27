/**
 * Supply Waterfall Adapter - TRUE Waterfall Chart
 *
 * Creates an "EBITDA Bridge" style waterfall showing supply accumulation:
 *
 * X-Axis: Supply Stages (Unsold → Upcoming → GLS → Total)
 * Y-Axis: Units
 *
 * Visual Structure:
 * - Unsold (Navy): Base bar starting from 0
 * - Upcoming (Blue): FLOATS on top of Unsold
 * - GLS (Sky): FLOATS on top of (Unsold + Upcoming)
 * - Total (Sand): Full bar from 0 showing final sum
 *
 * The "floating" effect is achieved with transparent spacer bars.
 *
 * RULE: Chart component receives this and renders. No math in component.
 */

// Colors for supply charts (warm tones for unsold/upcoming)
const COLORS = {
  unsoldInventory: '#92400e',  // Warm brown
  upcomingLaunches: '#c2410c', // Warm orange
  glsPipeline: '#94B4C1',      // Sky Blue
  glsExcluded: 'rgba(148, 180, 193, 0.3)',  // Sky Blue @ 30% opacity
  total: '#EAE0CF',            // Sand/Cream
  spacer: 'transparent',       // Invisible spacer
  connector: '#94B4C1',        // Bridge line color
};

// Border colors for better definition
const BORDER_COLORS = {
  unsoldInventory: '#7a3309',  // Darker brown
  upcomingLaunches: '#a3350a', // Darker orange
  glsPipeline: '#7a9dab',
  glsExcluded: 'rgba(122, 157, 171, 0.5)',
  total: '#d4c9b8',
};

/**
 * Format date string to readable format
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
 * Format number with thousand separators
 */
function formatNumber(value) {
  if (value === null || value === undefined) return '0';
  return value.toLocaleString('en-US');
}

/**
 * Transform API response to TRUE waterfall format.
 *
 * X-Axis: Supply stages (Unsold → Upcoming → GLS → Total)
 * Each step floats on top of the previous cumulative value.
 *
 * @param {Object} apiResponse - Response from /api/supply/summary
 * @param {Object} options - Transform options
 * @param {string} options.region - Optional region filter (CCR/RCR/OCR or null for all)
 * @param {boolean} options.includeGls - Whether GLS is included
 * @returns {Object} Chart.js compatible data structure
 */
export function transformRegionalWaterfall(apiResponse, options = {}) {
  const { region = null, includeGls = true } = options;
  const { byRegion, totals, meta } = apiResponse;

  // Get values for selected region or all regions
  let unsold, upcoming, gls;

  if (region && byRegion[region]) {
    // Single region selected
    const regionData = byRegion[region];
    unsold = regionData.unsoldInventory || 0;
    upcoming = regionData.upcomingLaunches || 0;
    gls = includeGls ? (regionData.glsPipeline || 0) : 0;
  } else {
    // All regions (use totals)
    unsold = totals?.unsoldInventory || 0;
    upcoming = totals?.upcomingLaunches || 0;
    gls = includeGls ? (totals?.glsPipeline || 0) : 0;
  }

  const total = unsold + upcoming + gls;

  // Build TRUE waterfall datasets
  const datasets = buildTrueWaterfallDatasets(unsold, upcoming, gls, total, includeGls);

  // Labels for X-axis: Supply stages
  const labels = includeGls
    ? ['Unsold\nInventory', 'Upcoming\nLaunches', 'GLS\nPipeline', 'Total\nSupply']
    : ['Unsold\nInventory', 'Upcoming\nLaunches', 'Total\nSupply'];

  // Bridge connector points for the waterfall lines
  const connectorPoints = buildConnectorPoints(unsold, upcoming, gls, includeGls);

  return {
    labels,
    datasets,
    connectorPoints,
    totals: {
      unsoldInventory: unsold,
      upcomingLaunches: upcoming,
      glsPipeline: gls,
      totalEffectiveSupply: total,
    },
    displayMeta: {
      subtitle: region
        ? `${region} Supply Pipeline`
        : 'All Regions Combined',
      asOf: formatDate(meta?.asOfDate),
      launchYear: meta?.launchYear || 2026,
      includesGls: includeGls,
      selectedRegion: region,
    },
  };
}

/**
 * Build TRUE waterfall datasets with floating bars.
 *
 * Structure for each bar:
 * - Spacer (transparent) + Value (colored)
 *
 * Spacer heights create the "floating" effect:
 * - Unsold spacer: 0 (starts from bottom)
 * - Upcoming spacer: unsold (floats above unsold)
 * - GLS spacer: unsold + upcoming (floats above both)
 * - Total spacer: 0 (full bar from bottom)
 */
function buildTrueWaterfallDatasets(unsold, upcoming, gls, total, includeGls) {
  // Tight gaps: bars nearly touch for solid visual flow
  // barPercentage: width of bar within its category slot
  // categoryPercentage: width of category slot within available space
  const BAR_PERCENTAGE = 0.92;      // Wide bars
  const CATEGORY_PERCENTAGE = 0.88; // Minimal gap between categories

  if (includeGls) {
    // With GLS: 4 bars
    return [
      // Spacer bars (transparent, create floating effect)
      {
        label: 'Spacer',
        data: [0, unsold, unsold + upcoming, 0],
        backgroundColor: COLORS.spacer,
        borderWidth: 0,
        barPercentage: BAR_PERCENTAGE,
        categoryPercentage: CATEGORY_PERCENTAGE,
      },
      // Value bars (visible)
      {
        label: 'Supply',
        data: [unsold, upcoming, gls, total],
        backgroundColor: [
          COLORS.unsoldInventory,
          COLORS.upcomingLaunches,
          COLORS.glsPipeline,
          COLORS.total,
        ],
        borderColor: [
          BORDER_COLORS.unsoldInventory,
          BORDER_COLORS.upcomingLaunches,
          BORDER_COLORS.glsPipeline,
          BORDER_COLORS.total,
        ],
        borderWidth: 1,
        barPercentage: BAR_PERCENTAGE,
        categoryPercentage: CATEGORY_PERCENTAGE,
      },
    ];
  } else {
    // Without GLS: 3 bars
    return [
      {
        label: 'Spacer',
        data: [0, unsold, 0],
        backgroundColor: COLORS.spacer,
        borderWidth: 0,
        barPercentage: BAR_PERCENTAGE,
        categoryPercentage: CATEGORY_PERCENTAGE,
      },
      {
        label: 'Supply',
        data: [unsold, upcoming, unsold + upcoming],
        backgroundColor: [
          COLORS.unsoldInventory,
          COLORS.upcomingLaunches,
          COLORS.total,
        ],
        borderColor: [
          BORDER_COLORS.unsoldInventory,
          BORDER_COLORS.upcomingLaunches,
          BORDER_COLORS.total,
        ],
        borderWidth: 1,
        barPercentage: BAR_PERCENTAGE,
        categoryPercentage: CATEGORY_PERCENTAGE,
      },
    ];
  }
}

/**
 * Build connector points for bridge lines between bars.
 * These will be drawn by a custom Chart.js plugin.
 */
function buildConnectorPoints(unsold, upcoming, gls, includeGls) {
  if (includeGls) {
    return [
      { from: 0, to: 1, y: unsold },                    // Unsold top → Upcoming bottom
      { from: 1, to: 2, y: unsold + upcoming },         // Upcoming top → GLS bottom
      { from: 2, to: 3, y: unsold + upcoming + gls },   // GLS top → Total top
    ];
  } else {
    return [
      { from: 0, to: 1, y: unsold },                    // Unsold top → Upcoming bottom
      { from: 1, to: 2, y: unsold + upcoming },         // Upcoming top → Total top
    ];
  }
}

/**
 * Transform API response to district breakdown (stacked bar for comparison).
 * Districts use stacked bars since waterfall doesn't make sense for comparison.
 *
 * @param {Object} apiResponse - Response from /api/supply/summary
 * @param {string|null} selectedRegion - Filter to specific region, or null for all districts
 * @param {Object} options - Transform options
 */
export function transformDistrictWaterfall(apiResponse, selectedRegion, options = {}) {
  const { includeGls = true } = options;
  const { byDistrict, meta } = apiResponse;

  // Filter districts by selected region (or show all if null)
  const filteredDistricts = Object.entries(byDistrict)
    .filter(([, data]) => selectedRegion === null || data.region === selectedRegion)
    .sort(([a], [b]) => a.localeCompare(b));

  if (filteredDistricts.length === 0) {
    return {
      labels: [],
      datasets: [],
      totals: { unsoldInventory: 0, upcomingLaunches: 0, glsPipeline: 0, totalEffectiveSupply: 0 },
      displayMeta: {
        subtitle: selectedRegion ? `No districts in ${selectedRegion}` : 'No district data',
        asOf: formatDate(meta?.asOfDate),
        launchYear: meta?.launchYear || 2026,
        includesGls: includeGls,
      },
    };
  }

  const labels = filteredDistricts.map(([district]) => district);
  const unsoldData = filteredDistricts.map(([, data]) => data.unsoldInventory);
  const upcomingData = filteredDistricts.map(([, data]) => data.upcomingLaunches);
  const glsData = includeGls ? filteredDistricts.map(([, data]) => data.glsPipeline || 0) : [];

  const districtTotals = {
    unsoldInventory: unsoldData.reduce((a, b) => a + b, 0),
    upcomingLaunches: upcomingData.reduce((a, b) => a + b, 0),
    glsPipeline: includeGls ? glsData.reduce((a, b) => a + b, 0) : 0,
    totalEffectiveSupply: 0,
  };
  districtTotals.totalEffectiveSupply = districtTotals.unsoldInventory + districtTotals.upcomingLaunches + districtTotals.glsPipeline;

  // District view uses stacked bars (not waterfall)
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

  // Add GLS dataset if included and has data
  if (includeGls && glsData.some(v => v > 0)) {
    datasets.push({
      label: 'GLS Pipeline',
      data: glsData,
      backgroundColor: COLORS.glsPipeline,
      borderColor: BORDER_COLORS.glsPipeline,
      borderWidth: 1,
      stack: 'supply',
    });
  }

  return {
    labels,
    datasets,
    totals: districtTotals,
    displayMeta: {
      subtitle: selectedRegion ? `${selectedRegion} Districts` : 'All Districts',
      asOf: formatDate(meta?.asOfDate),
      launchYear: meta?.launchYear || 2026,
      includesGls: includeGls && districtTotals.glsPipeline > 0,
      selectedRegion,
    },
  };
}

/**
 * Get tooltip content for waterfall bar.
 */
export function getWaterfallTooltip(context, totals, includeGls) {
  const { dataIndex, dataset } = context;
  const value = dataset.data[dataIndex];

  // Skip spacer tooltips
  if (dataset.label === 'Spacer' || value === 0) {
    return [];
  }

  const labels = includeGls
    ? ['Unsold Inventory', 'Upcoming Launches', 'GLS Pipeline', 'Total Supply']
    : ['Unsold Inventory', 'Upcoming Launches', 'Total Supply'];

  const stepName = labels[dataIndex];
  const lines = [];

  lines.push(stepName);
  lines.push('─────────────────');
  lines.push(`${formatNumber(value)} units`);

  // Show running total for intermediate steps
  if (stepName !== 'Total Supply') {
    let runningTotal = 0;
    if (dataIndex === 0) {
      runningTotal = totals.unsoldInventory;
    } else if (dataIndex === 1) {
      runningTotal = totals.unsoldInventory + totals.upcomingLaunches;
    } else if (dataIndex === 2 && includeGls) {
      runningTotal = totals.totalEffectiveSupply;
    }
    if (runningTotal > 0 && dataIndex > 0) {
      lines.push('');
      lines.push(`Running total: ${formatNumber(runningTotal)}`);
    }
  }

  return lines;
}

/**
 * Chart.js plugin to draw bridge connector lines between waterfall bars.
 * With tight gaps, these become short, punchy connectors.
 */
export const waterfallConnectorPlugin = {
  id: 'waterfallConnector',
  afterDatasetsDraw(chart) {
    const { ctx, data, scales } = chart;
    const connectorPoints = data.connectorPoints;

    if (!connectorPoints || connectorPoints.length === 0) return;

    const xScale = scales.x;
    const yScale = scales.y;

    // Calculate bar width based on tight percentages
    const categoryWidth = xScale.getPixelForValue(1) - xScale.getPixelForValue(0);
    const barWidth = categoryWidth * 0.88 * 0.92; // categoryPercentage * barPercentage
    const halfBar = barWidth / 2;

    ctx.save();
    ctx.strokeStyle = COLORS.connector;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]); // Shorter dash for tighter look

    connectorPoints.forEach(({ from, to, y }) => {
      // Get bar edge positions (right edge of 'from' bar, left edge of 'to' bar)
      const fromCenter = xScale.getPixelForValue(from);
      const toCenter = xScale.getPixelForValue(to);

      const x1 = fromCenter + halfBar;  // Right edge of 'from' bar
      const x2 = toCenter - halfBar;    // Left edge of 'to' bar
      const yPos = yScale.getPixelForValue(y);

      ctx.beginPath();
      ctx.moveTo(x1, yPos);
      ctx.lineTo(x2, yPos);
      ctx.stroke();
    });

    ctx.restore();
  },
};

/**
 * Get chart options for the TRUE waterfall chart.
 */
export function getWaterfallChartOptions(totals, includeGls) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: true,
      mode: 'nearest',
    },
    plugins: {
      legend: {
        display: false, // Hide legend for cleaner look
      },
      tooltip: {
        enabled: true,
        callbacks: {
          title: () => '',
          label: (context) => {
            const lines = getWaterfallTooltip(context, totals, includeGls);
            return lines.length > 0 ? lines : null;
          },
        },
        filter: (tooltipItem) => tooltipItem.dataset.label !== 'Spacer',
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
          font: { size: 11, weight: '600' },
          color: '#213448',
          maxRotation: 0,
          autoSkip: false,
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

/**
 * Get chart options for the district stacked bar chart.
 * Shows legend and proper tooltips for stacked bars.
 */
export function getDistrictChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 8,
          font: { size: 11 },
          color: '#213448',
        },
      },
      tooltip: {
        enabled: true,
        callbacks: {
          title: (items) => items[0]?.label || '',
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.raw || 0;
            return `${label}: ${formatNumber(value)} units`;
          },
          footer: (items) => {
            const total = items.reduce((sum, item) => sum + (item.raw || 0), 0);
            return `Total: ${formatNumber(total)} units`;
          },
        },
        backgroundColor: 'rgba(33, 52, 72, 0.95)',
        padding: 10,
        titleFont: { size: 12, weight: 'bold' },
        bodyFont: { size: 11 },
        footerFont: { size: 11, weight: 'bold' },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          font: { size: 10 },
          color: '#547792',
          maxRotation: 45,
          minRotation: 0,
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
  getDistrictChartOptions,
  waterfallConnectorPlugin,
};
