/**
 * District Comparison Transformations
 *
 * Transforms /api/aggregate responses for the district comparison chart.
 * Groups projects by age bucket, with selected project's age cohort first.
 *
 * Used by: DistrictComparisonChart on Project Deep Dive page
 */

import { isDev } from './validation';
import { getAggField, AggField } from '../../schemas/apiContract';
import { AGE_BAND_LABELS_SHORT } from '../../constants';

// Minimum units threshold for non-boutique projects
const DEFAULT_MIN_UNITS = 100;

// Age band order: New Sale first, then age ascending (youngest to oldest)
// Matches backend PropertyAgeBucket classification
const AGE_BAND_ORDER = ['new_sale', 'just_top', 'recently_top', 'young_resale', 'resale', 'mature_resale', 'freehold', 'unknown'];

/**
 * Transform raw aggregate data for district comparison horizontal bar chart.
 *
 * Groups projects by age band, shows selected project's age cohort first,
 * then other age buckets ordered by age (newest → oldest).
 * Within each bucket: sorted by median PSF descending.
 *
 * @param {Object} apiResponse - Raw API response from /api/aggregate
 * @param {string} selectedProjectName - The project to highlight
 * @param {number} minUnits - Minimum units threshold (default 100)
 * @returns {Object} Transformed data:
 *   {
 *     groups: [
 *       { band, label, isSelectedBand, projects: [...] },
 *       ...
 *     ],
 *     stats: { maxPsf, minPsf, projectCount, selectedRank, selectedAgeBand }
 *   }
 */
export const transformDistrictComparison = (apiResponse, selectedProjectName, minUnits = DEFAULT_MIN_UNITS) => {
  // Handle null/undefined/empty input
  const rawData = apiResponse?.data;
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    if (isDev) console.warn('[transformDistrictComparison] Empty or invalid input');
    return {
      groups: [],
      stats: {
        maxPsf: 0,
        minPsf: 0,
        projectCount: 0,
        selectedRank: null,
        selectedAgeBand: null,
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

  // Map each project using age_band from API (canonical, lease-based classification)
  const classified = filtered.map((row) => {
    const projectName = getAggField(row, AggField.PROJECT);
    const totalUnits = getAggField(row, AggField.TOTAL_UNITS);
    const normalizedProject = projectName?.toUpperCase()?.trim();
    const isSelected = normalizedProject === normalizedSelected;
    const isBoutique = totalUnits !== null && totalUnits !== undefined && totalUnits < minUnits;

    // Use age_band from API (calculated from lease_start_year on backend)
    const ageBand = getAggField(row, AggField.AGE_BAND) || 'unknown';
    const propertyAge = getAggField(row, AggField.PROPERTY_AGE_YEARS);
    const ageBandLabel = AGE_BAND_LABELS_SHORT[ageBand] || 'Unknown Age';

    return {
      projectName,
      medianPsf: getAggField(row, AggField.MEDIAN_PSF),
      count: getAggField(row, AggField.COUNT),
      totalUnits,
      totalUnitsSource: getAggField(row, AggField.TOTAL_UNITS_SOURCE),
      totalUnitsConfidence: getAggField(row, AggField.TOTAL_UNITS_CONFIDENCE),
      leaseStartYear: getAggField(row, AggField.LEASE_START_YEAR),
      age: propertyAge,
      ageBand,
      ageBandLabel,
      isSelected,
      isBoutique,
    };
  });

  // Find selected project's age band
  const selectedProject = classified.find((p) => p.isSelected);
  const selectedAgeBand = selectedProject?.ageBand || null;

  // Group by age band
  const groupedMap = AGE_BAND_ORDER.reduce((acc, band) => {
    const projectsInBand = classified
      .filter((p) => p.ageBand === band)
      .sort((a, b) => (b.medianPsf || 0) - (a.medianPsf || 0));

    if (projectsInBand.length > 0) {
      acc.push({
        band,
        label: AGE_BAND_LABELS_SHORT[band] || 'Unknown Age',
        isSelectedBand: band === selectedAgeBand,
        projects: projectsInBand,
      });
    }
    return acc;
  }, []);

  // Keep groups in AGE_BAND_ORDER: New Sale first, then age ascending
  // (No reordering - groupedMap is already in correct order from AGE_BAND_ORDER)
  const groups = groupedMap;

  // Calculate stats
  const allProjects = classified;
  const psfValues = allProjects.map((p) => p.medianPsf).filter((v) => v != null);
  const maxPsf = psfValues.length > 0 ? Math.max(...psfValues) : 0;
  const minPsf = psfValues.length > 0 ? Math.min(...psfValues) : 0;

  // Find selected project rank within its age band (1-indexed)
  let selectedRank = null;
  const selectedGroup = groups.find((g) => g.isSelectedBand);
  if (selectedGroup && selectedProject) {
    const rankInBand = selectedGroup.projects.findIndex((p) => p.isSelected);
    selectedRank = rankInBand >= 0 ? rankInBand + 1 : null;
  }

  return {
    groups,
    stats: {
      maxPsf,
      minPsf,
      projectCount: allProjects.length,
      selectedRank,
      selectedAgeBand,
      selectedAgeBandLabel: selectedAgeBand ? (AGE_BAND_LABELS_SHORT[selectedAgeBand] || 'Unknown Age') : null,
      groupCount: groups.length,
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
