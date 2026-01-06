/**
 * Landing Page Preview Data
 * Static sample data for the landing page chart previews.
 * This data is curated to be visually representative without API calls.
 */

// Regional Pricing Preview - CCR/RCR/OCR price beads
export const REGIONAL_PRICING_DATA = [
  { name: 'CCR', color: '#213448', prices: [2800, 3200, 3600, 4200] },
  { name: 'RCR', color: '#547792', prices: [1800, 2100, 2400, 2900] },
  { name: 'OCR', color: '#94B4C1', prices: [1400, 1650, 1900, 2200] },
];

// Volume Trend Preview - 6-month rolling transaction volumes
export const VOLUME_TREND_DATA = {
  months: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  volumes: [320, 280, 350, 410, 380, 420],
};

// District Growth Preview - Top 5 performers with PSF delta
export const DISTRICT_GROWTH_DATA = [
  { id: 'D09', name: 'Orchard', start: 2100, end: 2480, delta: '+18.1%' },
  { id: 'D10', name: 'Tanglin', start: 2200, end: 2520, delta: '+14.5%' },
  { id: 'D03', name: 'Tiong Bahru', start: 1850, end: 2110, delta: '+14.1%' },
  { id: 'D15', name: 'East Coast', start: 1720, end: 1950, delta: '+13.4%' },
  { id: 'D16', name: 'Bedok', start: 1520, end: 1680, delta: '+10.5%' },
];

// Momentum Grid Preview - 28 districts with trend direction
// CCR/prime districts trend up, some OCR down
export const MOMENTUM_GRID_DATA = Array.from({ length: 28 }, (_, i) => ({
  id: `D${String(i + 1).padStart(2, '0')}`,
  trend: [1, 2, 3, 6, 7, 9, 10, 11, 12, 14, 15, 19, 21].includes(i + 1) ? 'up' : 'down',
}));

// Terminal simulation lines for the typing effect
export const TERMINAL_LINES = [
  'AUTH: GUEST // CLEARANCE: NONE',
  'MODE: READ-ONLY PREVIEW',
  '',
  '> handshake ura.endpoint … OK',
  '> pipeline.validate integrity=99.2% … OK',
  '> sync resale.stream offset=0 … OK',
  '',
  'READY: awaiting command',
];

// Max price for dumbbell chart scaling
export const MAX_DISTRICT_PRICE = 2600;

// Signal Feed Events - Live surveillance-style event stream
// Language: Volume→Liquidity, Risk→Exposure, Safe→High Confidence
export const SIGNAL_EVENTS = [
  { id: 'sig_001', time: '21:19', region: 'OCR', district: 'D23', type: 'LIQUIDITY_SPIKE', delta: '+18%', sigma: true },
  { id: 'sig_002', time: '21:21', region: 'CCR', district: 'D09', type: 'PRICE_COMPRESSION', status: 'EASING' },
  { id: 'sig_003', time: '21:22', region: 'RCR', district: 'D15', type: 'APPRECIATION_VECTOR', delta: '+2.1%' },
  { id: 'sig_004', time: '21:24', region: 'OCR', district: 'D19', type: 'HIGH_CONFIDENCE', score: '87%' },
  { id: 'sig_005', time: '21:26', region: 'CCR', district: 'D10', type: 'EXPOSURE_ALERT', level: 'MODERATE' },
  { id: 'sig_006', time: '21:28', region: 'RCR', district: 'D03', type: 'LIQUIDITY_SPIKE', delta: '+12%', sigma: true },
  { id: 'sig_007', time: '21:31', region: 'OCR', district: 'D17', type: 'APPRECIATION_VECTOR', delta: '+1.8%' },
  { id: 'sig_008', time: '21:33', region: 'CCR', district: 'D11', type: 'HIGH_CONFIDENCE', score: '92%' },
];
