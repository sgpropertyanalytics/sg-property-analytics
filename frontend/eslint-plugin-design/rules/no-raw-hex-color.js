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
];

// Color to semantic name mapping for suggestions
const COLOR_MAPPING = {
  // Primary brand colors
  '#213448': 'navy (CCR) - import REGION_BADGE_CLASSES.CCR',
  '#547792': 'blue (RCR) - import REGION_BADGE_CLASSES.RCR',
  '#94b4c1': 'sky (OCR) - import REGION_BADGE_CLASSES.OCR',
  '#94B4C1': 'sky (OCR) - import REGION_BADGE_CLASSES.OCR',
  '#eae0cf': 'sand - use bg-[#EAE0CF] from constants',
  '#EAE0CF': 'sand - use bg-[#EAE0CF] from constants',

  // Bloomberg Terminal typography colors (from chartOptions.js)
  '#0f172a': 'slate-900 (chart ticks) - use CHART_AXIS_DEFAULTS or text-slate-900',
  '#0F172A': 'slate-900 (chart ticks) - use CHART_AXIS_DEFAULTS or text-slate-900',
  '#64748b': 'slate-500 (axis titles) - use CHART_AXIS_DEFAULTS or text-slate-500',
  '#64748B': 'slate-500 (axis titles) - use CHART_AXIS_DEFAULTS or text-slate-500',
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
