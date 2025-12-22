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
