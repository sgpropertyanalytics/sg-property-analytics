/**
 * Design Rules - Single Source of Truth for Design Validation
 *
 * This file defines allowed values for typography, colors, spacing,
 * and component patterns. The designer-validator agent and ESLint
 * plugin enforce these rules.
 *
 * @see .claude/agents/designer-validator.md
 * @see .claude/skills/dashboard-design/SKILL.md
 */

// =============================================================================
// TYPOGRAPHY RULES
// =============================================================================

export const TYPOGRAPHY = {
  // Allowed Tailwind text sizes (standard scale)
  allowedSizes: [
    'text-xs', // 12px
    'text-sm', // 14px
    'text-base', // 16px
    'text-lg', // 18px
    'text-xl', // 20px
    'text-2xl', // 24px
    'text-3xl', // 30px
    'text-4xl', // 36px
  ],

  // Approved exceptions for specific use cases
  // These are the ONLY arbitrary sizes allowed
  allowedArbitrarySizes: [
    'text-[7px]', // Ultra-micro labels (chart tick marks)
    'text-[8px]', // Micro labels (chart annotations, legends)
    'text-[9px]', // Micro labels (chart annotations)
    'text-[10px]', // Small footnotes, tooltips
    'text-[11px]', // Compact table cells
    'text-[22px]', // KPI hero values (between xl and 2xl)
    'text-[28px]', // KPI hero values responsive
    'text-[32px]', // KPI hero values large screens
  ],

  // Patterns that trigger TYPO-001 violation
  forbiddenPatterns: [
    /text-\[\d+px\]/, // text-[13px], text-[15px], etc.
    /text-\[\d+\.?\d*rem\]/, // text-[1.5rem]
    /text-\[\d+\.?\d*em\]/, // text-[1.2em]
  ],

  // Line height requirements by text role
  lineHeightByRole: {
    heading: ['leading-tight', 'leading-none'],
    body: ['leading-normal', 'leading-relaxed'],
    kpi: ['leading-none', 'leading-tight'],
  },

  // Numeric value requirements (TYPO-002, TYPO-003, TYPO-004)
  // Bloomberg Terminal Typography Theme (IBM Plex Mono)
  numericRequirements: {
    // KPI values: font-data class OR font-mono + tabular-nums + whitespace-nowrap
    kpiValues: {
      preferredClass: 'font-data', // CSS utility that combines all requirements
      fallbackRequired: ['font-mono', 'tabular-nums'],
      noWrap: 'whitespace-nowrap',
    },
    // Table numbers: font-data OR font-mono + tabular-nums
    tableNumbers: {
      preferredClass: 'font-data',
      fallbackRequired: ['font-mono', 'tabular-nums'],
    },
    // Chart axis labels: Use CHART_AXIS_DEFAULTS from chartOptions.js
    chartLabels: {
      useConstant: 'CHART_AXIS_DEFAULTS',
      required: ['tabular-nums'],
    },
  },

  // Font families (from index.css @theme)
  fontFamilies: {
    sans: '"Inter", system-ui, -apple-system, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
};

// =============================================================================
// COLOR RULES
// =============================================================================

export const COLORS = {
  // Canonical palette (from constants/index.js)
  palette: {
    // Primary brand colors
    navy: '#213448', // Primary text, headings, CCR
    blue: '#547792', // Secondary text, labels, RCR
    sky: '#94B4C1', // Borders, icons, OCR, disabled
    sand: '#EAE0CF', // Backgrounds, hover states

    // Bloomberg Terminal typography colors (from chartOptions.js)
    slate900: '#0f172a', // Chart axis ticks, KPI numbers (high contrast)
    slate500: '#64748b', // Chart axis titles (hierarchy)
  },

  // Region color mapping
  regionColors: {
    CCR: '#213448',
    RCR: '#547792',
    OCR: '#94B4C1',
  },

  // Allowed color import sources from constants
  allowedImports: [
    'REGION_BADGE_CLASSES',
    'FLOOR_LEVEL_COLORS',
    'LIQUIDITY_COLORS',
    'getRegionBadgeClass',
    'getFloorLevelColor',
    'getLiquidityColor',
  ],

  // Patterns that trigger COLOR-001/COLOR-002 violations
  // These are forbidden in component files
  forbiddenPatterns: [
    /bg-\[#[0-9a-fA-F]{3,8}\]/, // bg-[#213448], bg-[#fff]
    /text-\[#[0-9a-fA-F]{3,8}\]/, // text-[#213448]
    /border-\[#[0-9a-fA-F]{3,8}\]/, // border-[#213448]
    /fill-\[#[0-9a-fA-F]{3,8}\]/, // fill-[#213448]
    /stroke-\[#[0-9a-fA-F]{3,8}\]/, // stroke-[#213448]
  ],

  // Files/directories where arbitrary colors ARE allowed
  allowedColorLocations: [
    // Config and constants
    'constants/index.js',
    'constants/chartOptions.js',
    'design-rules.js',
    'tailwind.config.js',
    'index.css',
    'main.jsx',

    // UI primitives (entire directory) - define design system
    'components/ui/',

    // Layout components (entire directory) - define shell colors
    'components/layout/',

    // Chart components (entire directory) - define chart colors
    'components/powerbi/',

    // Insights/visualization components (entire directory)
    'components/insights/',

    // Common/shared components (entire directory)
    'components/common/',

    // Filter components (entire directory)
    'components/filters/',

    // Landing page components (entire directory)
    'components/landing/',

    // Modal components - define their own styling
    'PricingModal.jsx',
    'AccountSettingsModal.jsx',

    // Other components that legitimately define colors
    'PriceDistributionHeroChart.jsx',
    'BlurredCell.jsx',
    'SuppressedValue.jsx',
    'ValueParityPanel.jsx',
    'ProtectedRoute.jsx',

    // Pages (define page-specific theming)
    'pages/',

    // Context providers
    'context/',

    // Data adapters (may contain color mappings)
    'adapters/',
  ],

  // Semantic color usage mapping (for documentation)
  semanticUsage: {
    '#213448': ['primary-text', 'heading', 'CCR-badge', 'CCR-chart'],
    '#547792': ['secondary-text', 'label', 'RCR-badge', 'RCR-chart'],
    '#94B4C1': ['border', 'disabled', 'OCR-badge', 'OCR-chart'],
    '#EAE0CF': ['background', 'hover', 'active-state'],
  },
};

// =============================================================================
// COMPONENT PATTERN RULES
// =============================================================================

export const COMPONENTS = {
  // Inline style properties that ARE allowed (dynamic styling)
  allowedInlineStyles: [
    'height',
    'minHeight',
    'maxHeight',
    'width',
    'minWidth',
    'maxWidth',
    'aspectRatio',
    'backgroundColor', // Only for data-driven dynamic colors
    'color', // Only for data-driven dynamic colors
    'opacity',
    'transform',
    'left',
    'top',
    'right',
    'bottom',
  ],

  // Inline style properties that are FORBIDDEN (use Tailwind)
  forbiddenInlineStyles: [
    'fontSize', // Use Tailwind text-* classes
    'fontWeight', // Use Tailwind font-* classes
    'fontFamily', // Use Tailwind font-* classes
    'lineHeight', // Use Tailwind leading-* classes
    'padding', // Use Tailwind p-* classes
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'margin', // Use Tailwind m-* classes
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'borderRadius', // Use Tailwind rounded-* classes
    'borderWidth', // Use Tailwind border-* classes
  ],

  // Required primitives for typography display
  typographyPrimitives: {
    kpiValue: ['KPICard', 'KPICardV2', 'InlineCard'],
    heading: ['PageHeader', 'h1', 'h2', 'h3'],
    label: ['span', 'label', 'p'],
  },
};

// =============================================================================
// NUMBER FORMATTING RULES
// =============================================================================

export const NUMBER_FORMATTING = {
  // Currency formatting
  currency: {
    // Expected patterns in formatted output
    patterns: [
      /\$[\d,]+/, // $1,234
      /\$[\d.]+[KMB]/, // $1.2M, $500K
    ],
    // Required formatter imports
    formatters: ['formatPrice', 'formatPSF', 'formatCurrency'],
  },

  // Count/quantity formatting
  count: {
    patterns: [/[\d,]+/], // 1,234 (with thousands separator)
    formatters: ['toLocaleString', 'formatNumber'],
  },

  // Percentage formatting
  percent: {
    patterns: [/-?[\d.]+%/], // -3.2%
    formatters: ['toFixed'],
    decimalPlaces: 1,
  },

  // PSF (Price per Square Foot) formatting
  psf: {
    patterns: [/\$[\d,]+/], // $1,823
    formatters: ['formatPSF'],
    decimalPlaces: 0,
  },

  // Chart axis label rules
  axisLabels: {
    // Use K/M/B suffixes for large numbers
    useSuffix: true,
    suffixThresholds: {
      K: 1_000,
      M: 1_000_000,
      B: 1_000_000_000,
    },
    // Always use thousands separators
    useThousandsSeparator: true,
  },
};

// =============================================================================
// VIOLATION CODES
// =============================================================================

export const VIOLATION_CODES = {
  // Typography violations (TYPO-xxx)
  'TYPO-001': {
    message: 'Arbitrary font size not in approved list',
    severity: 'error',
    fix: 'Use standard Tailwind scale (text-xs, text-sm, text-base, etc.) or approved exceptions in design-rules.js',
  },
  'TYPO-002': {
    message: 'Missing tabular-nums on numeric value',
    severity: 'warn',
    fix: 'Add "tabular-nums" class for proper numeric alignment',
  },
  'TYPO-003': {
    message: 'Missing font-mono on KPI/price value',
    severity: 'warn',
    fix: 'Add "font-mono" class for consistent numeric width',
  },
  'TYPO-004': {
    message: 'KPI value missing whitespace-nowrap',
    severity: 'warn',
    fix: 'Add "whitespace-nowrap" to prevent KPI values from wrapping',
  },
  'TYPO-005': {
    message: 'Incorrect line-height for text role',
    severity: 'warn',
    fix: 'Use leading-tight for headings, leading-normal for body text',
  },

  // Color violations (COLOR-xxx)
  'COLOR-001': {
    message: 'Raw hex color in component (must import from constants)',
    severity: 'error',
    fix: 'Import from REGION_BADGE_CLASSES, FLOOR_LEVEL_COLORS, or use semantic Tailwind classes',
  },
  'COLOR-002': {
    message: 'Arbitrary Tailwind color outside allowed locations',
    severity: 'error',
    fix: 'Move color definition to constants/index.js or use existing palette',
  },
  'COLOR-003': {
    message: 'Semantic color used incorrectly',
    severity: 'warn',
    fix: 'Check COLORS.semanticUsage for correct color-to-purpose mapping',
  },
  'COLOR-004': {
    message: 'Missing color import from constants',
    severity: 'warn',
    fix: 'Import color constants instead of hardcoding hex values',
  },

  // Component violations (COMP-xxx)
  'COMP-001': {
    message: 'Forbidden inline style property',
    severity: 'error',
    fix: 'Use Tailwind utility classes instead of inline styles for this property',
  },
  'COMP-002': {
    message: 'Should use typography primitive component',
    severity: 'warn',
    fix: 'Use KPICard/KPICardV2 for KPI values, PageHeader for page titles',
  },
  'COMP-003': {
    message: 'Missing required component pattern',
    severity: 'warn',
    fix: 'Follow the component pattern defined in dashboard-design skill',
  },

  // Number formatting violations (NUM-xxx)
  'NUM-001': {
    message: 'Currency value missing thousands separator',
    severity: 'error',
    fix: 'Use formatPrice() or toLocaleString() for currency formatting',
  },
  'NUM-002': {
    message: 'Chart axis without proper formatter',
    severity: 'warn',
    fix: 'Use tick formatter with K/M/B suffixes and thousands separators',
  },
  'NUM-003': {
    message: 'Missing number formatter import',
    severity: 'warn',
    fix: 'Import formatPrice, formatPSF, or formatNumber from constants',
  },
  'NUM-004': {
    message: 'Incorrect decimal precision',
    severity: 'warn',
    fix: 'Use correct decimal places: PSF=0, percent=1, price suffix=2',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a font size is allowed
 * @param {string} sizeClass - Tailwind size class (e.g., 'text-sm', 'text-[13px]')
 * @returns {boolean}
 */
export function isAllowedFontSize(sizeClass) {
  // Standard sizes always allowed
  if (TYPOGRAPHY.allowedSizes.includes(sizeClass)) {
    return true;
  }
  // Check approved arbitrary sizes
  if (TYPOGRAPHY.allowedArbitrarySizes.includes(sizeClass)) {
    return true;
  }
  // Check if it matches any forbidden pattern
  return !TYPOGRAPHY.forbiddenPatterns.some((pattern) => pattern.test(sizeClass));
}

/**
 * Check if a file is allowed to contain arbitrary colors
 * @param {string} filePath - Path to the file
 * @returns {boolean}
 */
export function isAllowedColorLocation(filePath) {
  return COLORS.allowedColorLocations.some((allowed) => filePath.includes(allowed));
}

/**
 * Check if an inline style property is allowed
 * @param {string} property - CSS property name
 * @returns {boolean}
 */
export function isAllowedInlineStyle(property) {
  return COMPONENTS.allowedInlineStyles.includes(property);
}

/**
 * Get violation details by code
 * @param {string} code - Violation code (e.g., 'TYPO-001')
 * @returns {object|null}
 */
export function getViolation(code) {
  return VIOLATION_CODES[code] || null;
}

/**
 * Extract arbitrary size value from Tailwind class
 * @param {string} className - e.g., 'text-[13px]'
 * @returns {string|null} - e.g., '13px' or null if not arbitrary
 */
export function extractArbitrarySize(className) {
  const match = className.match(/text-\[(\d+(?:px|rem|em))\]/);
  return match ? match[1] : null;
}

/**
 * Suggest closest allowed size for an arbitrary value
 * @param {string} arbitrarySize - e.g., '13px'
 * @returns {string} - Suggested Tailwind class
 */
export function suggestAllowedSize(arbitrarySize) {
  const sizeMap = {
    '12px': 'text-xs',
    '13px': 'text-sm',
    '14px': 'text-sm',
    '15px': 'text-base',
    '16px': 'text-base',
    '17px': 'text-lg',
    '18px': 'text-lg',
    '19px': 'text-xl',
    '20px': 'text-xl',
    '21px': 'text-xl',
    '22px': 'text-[22px]', // Approved exception
    '23px': 'text-2xl',
    '24px': 'text-2xl',
  };
  return sizeMap[arbitrarySize] || 'text-base';
}
