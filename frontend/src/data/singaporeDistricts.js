/**
 * Singapore Postal Districts SVG Path Data
 *
 * Simplified polygon representations of Singapore's 28 postal districts.
 * These paths are designed for a viewBox of "0 0 400 280" and represent
 * the approximate geographic positions of each district.
 *
 * Districts are organized by region:
 * - CCR (Core Central Region): D01, D02, D06, D07, D09, D10, D11
 * - RCR (Rest of Central Region): D03, D04, D05, D08, D12, D13, D14, D15, D20
 * - OCR (Outside Central Region): D16-D19, D21-D28
 */

// Centroid positions for each district (for labels/tooltips)
export const DISTRICT_CENTROIDS = {
  D01: { x: 195, y: 175 },  // Raffles Place / Marina
  D02: { x: 175, y: 185 },  // Tanjong Pagar
  D03: { x: 145, y: 165 },  // Queenstown
  D04: { x: 135, y: 195 },  // Harbourfront
  D05: { x: 110, y: 155 },  // Pasir Panjang
  D06: { x: 185, y: 160 },  // City Hall
  D07: { x: 200, y: 150 },  // Bugis
  D08: { x: 195, y: 135 },  // Little India
  D09: { x: 170, y: 145 },  // Orchard
  D10: { x: 145, y: 130 },  // Tanglin / Holland
  D11: { x: 175, y: 120 },  // Newton / Novena
  D12: { x: 195, y: 115 },  // Balestier / Toa Payoh
  D13: { x: 220, y: 120 },  // Potong Pasir
  D14: { x: 235, y: 145 },  // Geylang / Paya Lebar
  D15: { x: 260, y: 170 },  // East Coast / Katong
  D16: { x: 295, y: 165 },  // Bedok
  D17: { x: 355, y: 155 },  // Changi
  D18: { x: 340, y: 120 },  // Tampines / Pasir Ris
  D19: { x: 280, y: 85 },   // Serangoon / Hougang / Punggol
  D20: { x: 200, y: 95 },   // Bishan / Ang Mo Kio
  D21: { x: 130, y: 105 },  // Upper Bukit Timah
  D22: { x: 75, y: 145 },   // Jurong
  D23: { x: 95, y: 95 },    // Bukit Batok / Bukit Panjang
  D24: { x: 55, y: 75 },    // Lim Chu Kang / Tengah
  D25: { x: 115, y: 45 },   // Kranji / Woodlands
  D26: { x: 175, y: 70 },   // Upper Thomson
  D27: { x: 230, y: 45 },   // Yishun / Sembawang
  D28: { x: 270, y: 55 },   // Seletar
};

// SVG paths for each district polygon
// These are simplified shapes that approximate the district boundaries
export const DISTRICT_PATHS = {
  // CCR Districts (Core Central Region)
  D01: "M185,165 L205,165 L215,175 L210,190 L190,190 L180,180 Z",
  D02: "M165,180 L185,175 L190,190 L185,205 L160,205 L155,190 Z",
  D06: "M175,150 L195,150 L200,160 L190,170 L175,170 L170,160 Z",
  D07: "M195,140 L215,140 L220,155 L210,165 L195,165 L190,155 Z",
  D09: "M155,135 L175,135 L180,150 L175,160 L155,160 L150,145 Z",
  D10: "M125,115 L155,115 L160,135 L155,155 L130,155 L120,135 Z",
  D11: "M160,105 L190,105 L195,125 L185,140 L160,140 L155,120 Z",

  // RCR Districts (Rest of Central Region)
  D03: "M125,155 L155,155 L160,175 L145,190 L120,185 L115,165 Z",
  D04: "M115,185 L145,185 L155,200 L145,220 L105,215 L100,195 Z",
  D05: "M85,140 L120,140 L125,160 L115,180 L85,175 L75,155 Z",
  D08: "M185,120 L210,120 L215,135 L205,150 L185,150 L180,135 Z",
  D12: "M180,100 L210,100 L215,120 L205,135 L180,135 L175,115 Z",
  D13: "M210,105 L240,105 L245,125 L235,140 L210,140 L205,120 Z",
  D14: "M215,130 L250,130 L260,155 L250,175 L220,175 L210,150 Z",
  D15: "M240,155 L280,155 L290,185 L270,200 L235,195 L230,170 Z",
  D20: "M180,80 L215,80 L220,100 L210,115 L180,115 L175,95 Z",

  // OCR Districts (Outside Central Region)
  D16: "M275,150 L315,150 L325,175 L310,195 L275,190 L265,165 Z",
  D17: "M325,135 L375,140 L380,165 L360,180 L325,175 L320,150 Z",
  D18: "M310,100 L360,105 L370,130 L355,150 L315,145 L305,120 Z",
  D19: "M245,65 L305,70 L315,100 L295,120 L250,115 L240,85 Z",
  D21: "M105,90 L145,90 L155,115 L140,140 L105,135 L95,110 Z",
  D22: "M40,120 L90,125 L100,155 L85,185 L40,180 L30,150 Z",
  D23: "M65,75 L110,80 L120,110 L105,135 L65,130 L55,100 Z",
  D24: "M25,55 L70,60 L80,90 L60,115 L25,110 L15,80 Z",
  D25: "M80,25 L145,30 L155,60 L135,85 L80,80 L70,50 Z",
  D26: "M150,50 L195,55 L205,80 L190,105 L155,100 L145,70 Z",
  D27: "M195,25 L265,30 L275,60 L255,85 L200,80 L190,50 Z",
  D28: "M255,40 L305,45 L315,75 L295,100 L260,95 L250,65 Z",
};

// Short display names for each district
export const DISTRICT_SHORT_NAMES = {
  D01: "Marina",
  D02: "Tanjong Pagar",
  D03: "Queenstown",
  D04: "Harbourfront",
  D05: "Pasir Panjang",
  D06: "City Hall",
  D07: "Bugis",
  D08: "Little India",
  D09: "Orchard",
  D10: "Holland",
  D11: "Newton",
  D12: "Toa Payoh",
  D13: "Potong Pasir",
  D14: "Geylang",
  D15: "East Coast",
  D16: "Bedok",
  D17: "Changi",
  D18: "Tampines",
  D19: "Hougang",
  D20: "Bishan",
  D21: "Clementi",
  D22: "Jurong",
  D23: "Bukit Batok",
  D24: "Tengah",
  D25: "Woodlands",
  D26: "Thomson",
  D27: "Yishun",
  D28: "Seletar",
};

// Region classification
export const DISTRICT_REGIONS = {
  D01: "CCR", D02: "CCR", D06: "CCR", D07: "CCR", D09: "CCR", D10: "CCR", D11: "CCR",
  D03: "RCR", D04: "RCR", D05: "RCR", D08: "RCR", D12: "RCR", D13: "RCR", D14: "RCR", D15: "RCR", D20: "RCR",
  D16: "OCR", D17: "OCR", D18: "OCR", D19: "OCR", D21: "OCR", D22: "OCR", D23: "OCR", D24: "OCR", D25: "OCR", D26: "OCR", D27: "OCR", D28: "OCR",
};

// Get all district IDs in order
export const ALL_DISTRICTS = Array.from({ length: 28 }, (_, i) => `D${String(i + 1).padStart(2, '0')}`);
