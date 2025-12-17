/**
 * Shared constants and utility functions for the SG Property Analyzer frontend
 */

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
  '2b': '2-Bedroom',
  '3b': '3-Bedroom',
  '4b': '4-Bedroom',
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
