/**
 * District Comparison Transformations
 *
 * Transforms /api/aggregate responses for the district comparison chart.
 * Filters projects by minimum unit count and highlights selected project.
 *
 * Used by: DistrictComparisonChart on Project Deep Dive page
 */

import { isDev } from './validation';
import { getAggField, AggField } from '../../schemas/apiContract';

// Minimum units threshold for non-boutique projects
const DEFAULT_MIN_UNITS = 100;

/**
 * Transform raw aggregate data for district comparison horizontal bar chart.
 *
 * Filters projects to >= minUnits OR selected project, sorts by median PSF descending,
 * and marks the selected project for highlighting.
 *
 * @param {Object} apiResponse - Raw API response from /api/aggregate
 * @param {string} selectedProjectName - The project to highlight
 * @param {number} minUnits - Minimum units threshold (default 100)
 * @returns {Object} Transformed data:
 *   {
 *     projects: [{ projectName, medianPsf, count, totalUnits, isSelected, isBoutique }, ...],
 *     stats: { maxPsf, minPsf, projectCount, selectedRank }
 *   }
 */
export const transformDistrictComparison = (apiResponse, selectedProjectName, minUnits = DEFAULT_MIN_UNITS) => {
  // Handle null/undefined/empty input
  const rawData = apiResponse?.data;
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    if (isDev) console.warn('[transformDistrictComparison] Empty or invalid input');
    return {
      projects: [],
      stats: {
        maxPsf: 0,
        minPsf: 0,
        projectCount: 0,
        selectedRank: null,
      },
    };
  }

  const normalizedSelected = selectedProjectName?.toUpperCase()?.trim();

  // Filter: >= minUnits OR is selected project
  const filtered = rawData.filter((row) => {
    const totalUnits = getAggField(row, AggField.TOTAL_UNITS);
    const projectName = getAggField(row, AggField.PROJECT);
    const normalizedProject = projectName?.toUpperCase()?.trim();

    // Always include selected project
    if (normalizedProject === normalizedSelected) return true;

    // Include if has enough units (or if units unknown, check transaction count as proxy)
    if (totalUnits !== null && totalUnits !== undefined) {
      return totalUnits >= minUnits;
    }

    // If total_units not available, use transaction count as proxy (> 10 transactions suggests non-boutique)
    const count = getAggField(row, AggField.COUNT) || 0;
    return count >= 10;
  });

  // Sort by median PSF descending
  const sorted = [...filtered].sort((a, b) => {
    const psfA = getAggField(a, AggField.MEDIAN_PSF) || 0;
    const psfB = getAggField(b, AggField.MEDIAN_PSF) || 0;
    return psfB - psfA;
  });

  // Transform to output structure
  const projects = sorted.map((row) => {
    const projectName = getAggField(row, AggField.PROJECT);
    const totalUnits = getAggField(row, AggField.TOTAL_UNITS);
    const normalizedProject = projectName?.toUpperCase()?.trim();
    const isSelected = normalizedProject === normalizedSelected;
    const isBoutique = totalUnits !== null && totalUnits !== undefined && totalUnits < minUnits;

    return {
      projectName,
      medianPsf: getAggField(row, AggField.MEDIAN_PSF),
      count: getAggField(row, AggField.COUNT),
      totalUnits,
      totalUnitsSource: getAggField(row, AggField.TOTAL_UNITS_SOURCE),
      totalUnitsConfidence: getAggField(row, AggField.TOTAL_UNITS_CONFIDENCE),
      isSelected,
      isBoutique,
    };
  });

  // Calculate stats
  const psfValues = projects.map((p) => p.medianPsf).filter((v) => v != null);
  const maxPsf = psfValues.length > 0 ? Math.max(...psfValues) : 0;
  const minPsf = psfValues.length > 0 ? Math.min(...psfValues) : 0;

  // Find selected project rank (1-indexed)
  const selectedIndex = projects.findIndex((p) => p.isSelected);
  const selectedRank = selectedIndex >= 0 ? selectedIndex + 1 : null;

  return {
    projects,
    stats: {
      maxPsf,
      minPsf,
      projectCount: projects.length,
      selectedRank,
    },
  };
};

/**
 * Format PSF value for display.
 *
 * @param {number} psf - PSF value
 * @returns {string} Formatted string like "$1,234"
 */
export const formatPsf = (psf) => {
  if (psf == null) return 'N/A';
  return `$${Math.round(psf).toLocaleString()}`;
};

/**
 * Truncate project name for chart labels.
 *
 * @param {string} name - Project name
 * @param {number} maxLength - Maximum length (default 25)
 * @returns {string} Truncated name with ellipsis if needed
 */
export const truncateProjectName = (name, maxLength = 25) => {
  if (!name) return '';
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 1) + '...';
};
