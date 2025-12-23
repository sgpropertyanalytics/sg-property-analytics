/**
 * Shared constants and utility functions for the SG Property Analyzer frontend
 *
 * IMPORTANT: District-to-Region mappings are SINGLE SOURCE OF TRUTH.
 * Do NOT duplicate these definitions elsewhere. Always import from here.
 */

// =============================================================================
// DISTRICT TO REGION MAPPING (URA Market Segments) - SINGLE SOURCE OF TRUTH
// =============================================================================

// Core Central Region - Premium/Prime districts
export const CCR_DISTRICTS = ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11'];

// Rest of Central Region - City fringe
export const RCR_DISTRICTS = ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20'];

// Outside Central Region - Suburban (D16-D19, D21-D28)
export const OCR_DISTRICTS = ['D16', 'D17', 'D18', 'D19', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28'];

/**
 * Get the market segment/region for a given district
 * @param {string} district - District code (e.g., 'D01', 'D07', '07')
 * @returns {'CCR' | 'RCR' | 'OCR'} Market segment
 */
export const getRegionForDistrict = (district) => {
  if (!district) return 'OCR';
  let d = district.toString().toUpperCase().trim();
  if (!d.startsWith('D')) {
    d = `D${d.padStart(2, '0')}`;
  }
  if (CCR_DISTRICTS.includes(d)) return 'CCR';
  if (RCR_DISTRICTS.includes(d)) return 'RCR';
  return 'OCR';
};

/**
 * Get all districts for a given market segment/region
 * @param {'CCR' | 'RCR' | 'OCR'} region - Market segment
 * @returns {string[]} Array of district codes
 */
export const getDistrictsForRegion = (region) => {
  const r = (region || '').toUpperCase();
  if (r === 'CCR') return CCR_DISTRICTS;
  if (r === 'RCR') return RCR_DISTRICTS;
  if (r === 'OCR') return OCR_DISTRICTS;
  return [];
};

/**
 * Check if a district belongs to a specific region
 * @param {string} district - District code
 * @param {'CCR' | 'RCR' | 'OCR'} region - Market segment to check
 * @returns {boolean}
 */
export const isDistrictInRegion = (district, region) => {
  return getRegionForDistrict(district) === region.toUpperCase();
};

// =============================================================================
// DISTRICT NAMES
// =============================================================================

// District names mapping (D01-D28)
export const DISTRICT_NAMES = {
  'D01': 'Boat Quay / Raffles Place / Marina Downtown / Suntec City',
  'D02': 'Shenton Way / Tanjong Pagar',
  'D03': 'Queenstown / Alexandra / Tiong Bahru',
  'D04': 'Harbourfront / Keppel / Telok Blangah',
  'D05': 'Buona Vista / Dover / Pasir Panjang',
  'D06': 'City Hall / Fort Canning',
  'D07': 'Bugis / Rochor',
  'D08': 'Little India / Farrer Park',
  'D09': 'Orchard / Somerset / River Valley',
  'D10': 'Tanglin / Bukit Timah / Holland',
  'D11': 'Newton / Novena / Dunearn / Watten',
  'D12': 'Balestier / Whampoa / Toa Payoh / Boon Keng / Bendemeer / Kampong Bugis',
  'D13': 'Potong Pasir / Bidadari / MacPherson / Upper Aljunied',
  'D14': 'Geylang / Dakota / Paya Lebar Central / Eunos / Ubi / Aljunied',
  'D15': 'Tanjong Rhu / Amber / Meyer / Katong / Dunman / Joo Chiat / Marine Parade',
  'D16': 'Bedok / Upper East Coast / Eastwood / Kew Drive',
  'D17': 'Loyang / Changi',
  'D18': 'Tampines / Pasir Ris',
  'D19': 'Serangoon Garden / Hougang / Sengkang / Punggol',
  'D20': 'Bishan / Ang Mo Kio',
  'D21': 'Upper Bukit Timah / Clementi Park / Ulu Pandan',
  'D22': 'Jurong / Boon Lay / Tuas',
  'D23': 'Bukit Batok / Bukit Panjang / Choa Chu Kang',
  'D24': 'Lim Chu Kang / Tengah',
  'D25': 'Kranji / Woodlands',
  'D26': 'Upper Thomson / Springleaf',
  'D27': 'Yishun / Sembawang',
  'D28': 'Seletar / Yio Chu Kang',
};

// Bedroom labels for display
export const BEDROOM_LABELS = {
  '1b': '1-Bedroom',
  '2b': '2-Bedroom',
  '3b': '3-Bedroom',
  '4b': '4-Bedroom',
  '5b': '5-Bedroom+',
};

// Short bedroom labels (for compact UI like filters)
export const BEDROOM_LABELS_SHORT = {
  1: '1BR',
  2: '2BR',
  3: '3BR',
  4: '4BR',
  5: '5BR+',
};

/**
 * Get short bedroom label for display (e.g., "2BR", "5BR+")
 * @param {number|string} bedroom - Bedroom count (1-5)
 * @returns {string} Short label like "2BR"
 */
export const getBedroomLabelShort = (bedroom) => {
  const num = parseInt(bedroom, 10);
  if (num >= 5) return '5BR+';
  return BEDROOM_LABELS_SHORT[num] || `${num}BR`;
};

/**
 * Get full bedroom label for display (e.g., "2-Bedroom", "5-Bedroom+")
 * @param {number|string} bedroom - Bedroom count (1-5)
 * @returns {string} Full label like "2-Bedroom"
 */
export const getBedroomLabelFull = (bedroom) => {
  const num = parseInt(bedroom, 10);
  if (num >= 5) return '5-Bedroom+';
  return BEDROOM_LABELS[`${num}b`] || `${num}-Bedroom`;
};

/**
 * Format a price value for display
 * @param {number} value - The price value
 * @returns {string} Formatted price string (e.g., "$2.41M", "$500K")
 */
export const formatPrice = (value) => {
  if (!value) return '-';
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(2)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

/**
 * Format a PSF (price per square foot) value for display
 * @param {number} value - The PSF value
 * @returns {string} Formatted PSF string (e.g., "$1,823")
 */
export const formatPSF = (value) => {
  if (!value) return '-';
  return `$${value.toLocaleString()}`;
};

// =============================================================================
// FLOOR LEVEL CLASSIFICATION - SINGLE SOURCE OF TRUTH
// =============================================================================

/**
 * Floor level tiers in display order (low to high)
 * Matches backend classification in classifier_extended.py
 */
export const FLOOR_LEVELS = ['Low', 'Mid-Low', 'Mid', 'Mid-High', 'High', 'Luxury'];

/**
 * Floor level display labels with floor ranges
 */
export const FLOOR_LEVEL_LABELS = {
  'Low': 'Low (01-05)',
  'Mid-Low': 'Mid-Low (06-10)',
  'Mid': 'Mid (11-20)',
  'Mid-High': 'Mid-High (21-30)',
  'High': 'High (31-40)',
  'Luxury': 'Luxury (41+)',
  'Unknown': 'Unknown',
};

/**
 * Floor level short labels for compact UI
 */
export const FLOOR_LEVEL_LABELS_SHORT = {
  'Low': '01-05',
  'Mid-Low': '06-10',
  'Mid': '11-20',
  'Mid-High': '21-30',
  'High': '31-40',
  'Luxury': '41+',
  'Unknown': '?',
};

/**
 * Floor level colors for charts (palette-consistent)
 * Gradient from lighter to darker representing floor height
 */
export const FLOOR_LEVEL_COLORS = {
  'Low': 'rgba(148, 180, 193, 0.8)',      // #94B4C1 - Sky Blue (lightest)
  'Mid-Low': 'rgba(120, 156, 175, 0.8)',  // Blend
  'Mid': 'rgba(84, 119, 146, 0.8)',       // #547792 - Ocean Blue
  'Mid-High': 'rgba(60, 90, 115, 0.8)',   // Blend
  'High': 'rgba(33, 52, 72, 0.8)',        // #213448 - Deep Navy
  'Luxury': 'rgba(139, 115, 85, 0.9)',    // Gold/Bronze for luxury
  'Unknown': 'rgba(200, 200, 200, 0.5)',  // Gray
};

/**
 * Get floor level label for display
 * @param {string} floorLevel - Floor level classification
 * @param {boolean} short - Use short label
 * @returns {string} Display label
 */
export const getFloorLevelLabel = (floorLevel, short = false) => {
  if (!floorLevel) return 'Unknown';
  return short
    ? (FLOOR_LEVEL_LABELS_SHORT[floorLevel] || floorLevel)
    : (FLOOR_LEVEL_LABELS[floorLevel] || floorLevel);
};

/**
 * Get floor level color for charts
 * @param {string} floorLevel - Floor level classification
 * @returns {string} RGBA color string
 */
export const getFloorLevelColor = (floorLevel) => {
  return FLOOR_LEVEL_COLORS[floorLevel] || FLOOR_LEVEL_COLORS['Unknown'];
};

/**
 * Get floor level index for sorting (0 = Low, 5 = Luxury)
 * @param {string} floorLevel - Floor level classification
 * @returns {number} Sort index (0-5, or 6 for Unknown)
 */
export const getFloorLevelIndex = (floorLevel) => {
  const index = FLOOR_LEVELS.indexOf(floorLevel);
  return index >= 0 ? index : 6; // Unknown goes last
};
