/**
 * ESLint Rule: no-raw-hex-color
 *
 * Disallows raw hex colors in Tailwind arbitrary value classes
 * unless the file is in an allowed location (constants, primitives).
 *
 * VIOLATION CODE: COLOR-001, COLOR-002
 *
 * @example
 * // Bad - raw hex in component file
 * <div className="bg-[#213448]">...</div>
 * <div className="text-[#547792]">...</div>
 *
 * // Good - import from constants
 * import { REGION_BADGE_CLASSES } from '../../constants';
 * <div className={REGION_BADGE_CLASSES.CCR}>...</div>
 *
 * // Good - use semantic Tailwind colors
 * <div className="bg-slate-900">...</div>
 */

// Files/directories where arbitrary colors ARE allowed
const ALLOWED_FILES = [
  // Config and constants
  'constants/index.js',
  'constants/colors.js',  // Centralized color system
  'constants/chartOptions.js',
  'constants/chartPalette.js',
  'design-rules.js',
  'tailwind.config.js',
  'index.css',
  'styles/tokens.css',

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
];

// Color to semantic name mapping for suggestions
// Updated for White Ops design system - prefer Tailwind tokens or imports from colors.js
const COLOR_MAPPING = {
  // Primary brand colors - USE TAILWIND TOKENS (preferred)
  '#213448': 'brand-navy → use "bg-brand-navy" or "text-brand-navy" Tailwind class',
  '#547792': 'brand-blue → use "bg-brand-blue" or "text-brand-blue" Tailwind class',
  '#94b4c1': 'brand-sky → use "bg-brand-sky" or "text-brand-sky" Tailwind class',
  '#94B4C1': 'brand-sky → use "bg-brand-sky" or "text-brand-sky" Tailwind class',
  '#eae0cf': 'brand-sand → use "bg-brand-sand" or "text-brand-sand" Tailwind class',
  '#EAE0CF': 'brand-sand → use "bg-brand-sand" or "text-brand-sand" Tailwind class',

  // Monochromatic base - USE TAILWIND TOKENS
  '#000000': 'mono-ink → use "bg-mono-ink" or "text-mono-ink" Tailwind class',
  '#171717': 'mono-dark → use "bg-mono-dark" or "text-mono-dark" Tailwind class',
  '#525252': 'mono-mid → use "bg-mono-mid" or "text-mono-mid" Tailwind class',
  '#A3A3A3': 'mono-light → use "bg-mono-light" or "text-mono-light" Tailwind class',
  '#a3a3a3': 'mono-light → use "bg-mono-light" or "text-mono-light" Tailwind class',
  '#E5E7EB': 'mono-muted → use "bg-mono-muted" or "border-mono-muted" Tailwind class',
  '#e5e7eb': 'mono-muted → use "bg-mono-muted" or "border-mono-muted" Tailwind class',
  '#FAFAFA': 'mono-canvas → use "bg-mono-canvas" Tailwind class',
  '#fafafa': 'mono-canvas → use "bg-mono-canvas" Tailwind class',

  // Liquidity zone colors (from LIQUIDITY in colors.js)
  '#F59E0B': 'LIQUIDITY.low → import { LIQUIDITY } from "../../constants/colors"',
  '#f59e0b': 'LIQUIDITY.low → import { LIQUIDITY } from "../../constants/colors"',
  '#10B981': 'LIQUIDITY.healthy or STATUS.live → import from "../../constants/colors"',
  '#10b981': 'LIQUIDITY.healthy or STATUS.live → import from "../../constants/colors"',
  '#EF4444': 'LIQUIDITY.high → import { LIQUIDITY } from "../../constants/colors"',
  '#ef4444': 'LIQUIDITY.high → import { LIQUIDITY } from "../../constants/colors"',

  // Supply pipeline colors (from SUPPLY in colors.js)
  '#6b4226': 'SUPPLY.unsold → import { SUPPLY } from "../../constants/colors"',
  '#9c6644': 'SUPPLY.upcoming → import { SUPPLY } from "../../constants/colors"',
  '#c4a77d': 'SUPPLY.gls → import { SUPPLY } from "../../constants/colors"',

  // Status colors
  '#FF5500': 'STATUS.negative → import { STATUS } from "../../constants/colors"',
  '#ff5500': 'STATUS.negative → import { STATUS } from "../../constants/colors"',

  // Bloomberg Terminal typography colors (from chartOptions.js)
  '#0f172a': 'slate-900 → use "text-slate-900" or CHART_AXIS_DEFAULTS',
  '#0F172A': 'slate-900 → use "text-slate-900" or CHART_AXIS_DEFAULTS',
  '#64748b': 'slate-500 → use "text-slate-500" or CHART_AXIS_DEFAULTS',
  '#64748B': 'slate-500 → use "text-slate-500" or CHART_AXIS_DEFAULTS',
};

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw hex colors in Tailwind classes',
      category: 'Design System',
      recommended: true,
    },
    schema: [],
    messages: {
      rawHexColor:
        '[COLOR-001] Raw hex color "{{color}}" not allowed in component files. {{suggestion}}',
      rawHexColorUnknown:
        '[COLOR-002] Raw hex color "{{color}}" not in design palette. Import from constants/index.js or add to palette.',
    },
  },

  create(context) {
    const filename = context.getFilename();

    // Skip allowed files
    if (ALLOWED_FILES.some((f) => filename.includes(f))) {
      return {};
    }

    /**
     * Extract hex color classes from a className string
     */
    function findHexColors(classString) {
      if (!classString || typeof classString !== 'string') return [];

      // Match bg-[#xxx], text-[#xxx], border-[#xxx], fill-[#xxx], stroke-[#xxx]
      const hexPattern = /(bg|text|border|fill|stroke)-\[#([0-9a-fA-F]{3,8})\]/g;
      const matches = [];
      let match;

      while ((match = hexPattern.exec(classString)) !== null) {
        matches.push({
          full: match[0],
          prefix: match[1],
          hex: `#${match[2]}`,
          index: match.index,
        });
      }

      return matches;
    }

    /**
     * Get suggestion for a hex color
     */
    function getSuggestion(hex) {
      const normalized = hex.toLowerCase();
      const upperNormalized = hex.toUpperCase();

      if (COLOR_MAPPING[normalized]) {
        return COLOR_MAPPING[normalized];
      }
      if (COLOR_MAPPING[upperNormalized]) {
        return COLOR_MAPPING[upperNormalized];
      }

      return null;
    }

    /**
     * Check className attribute
     */
    function checkClassNameAttribute(node) {
      // Handle string literal className
      if (node.value && node.value.type === 'Literal') {
        const classString = node.value.value;
        const hexColors = findHexColors(classString);

        for (const color of hexColors) {
          const suggestion = getSuggestion(color.hex);

          if (suggestion) {
            context.report({
              node: node.value,
              messageId: 'rawHexColor',
              data: {
                color: color.full,
                suggestion: `This is ${suggestion}`,
              },
            });
          } else {
            context.report({
              node: node.value,
              messageId: 'rawHexColorUnknown',
              data: {
                color: color.full,
              },
            });
          }
        }
      }

      // Handle template literal className
      if (node.value && node.value.type === 'JSXExpressionContainer') {
        const expr = node.value.expression;

        // Handle simple template literals
        if (expr.type === 'TemplateLiteral') {
          for (const quasi of expr.quasis) {
            const classString = quasi.value.raw;
            const hexColors = findHexColors(classString);

            for (const color of hexColors) {
              const suggestion = getSuggestion(color.hex);

              if (suggestion) {
                context.report({
                  node: quasi,
                  messageId: 'rawHexColor',
                  data: {
                    color: color.full,
                    suggestion: `This is ${suggestion}`,
                  },
                });
              } else {
                context.report({
                  node: quasi,
                  messageId: 'rawHexColorUnknown',
                  data: {
                    color: color.full,
                  },
                });
              }
            }
          }
        }

        // Handle string literals inside expressions
        if (expr.type === 'Literal' && typeof expr.value === 'string') {
          const hexColors = findHexColors(expr.value);
          for (const color of hexColors) {
            const suggestion = getSuggestion(color.hex);
            if (suggestion) {
              context.report({
                node: expr,
                messageId: 'rawHexColor',
                data: {
                  color: color.full,
                  suggestion: `This is ${suggestion}`,
                },
              });
            } else {
              context.report({
                node: expr,
                messageId: 'rawHexColorUnknown',
                data: {
                  color: color.full,
                },
              });
            }
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name && node.name.name === 'className') {
          checkClassNameAttribute(node);
        }
      },
    };
  },
};
