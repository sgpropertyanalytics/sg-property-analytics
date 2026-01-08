/**
 * ESLint Plugin: design
 *
 * Custom ESLint rules for enforcing design system consistency.
 * Works with the designer-validator agent to catch typography,
 * color, and formatting issues at lint time.
 *
 * Rules:
 * - design/no-arbitrary-font-size: Disallow arbitrary Tailwind font sizes
 * - design/no-raw-hex-color: Disallow raw hex colors in components
 * - design/require-tabular-nums: Require tabular-nums on numeric values
 *
 * @see frontend/src/design-rules.js - Design system rules
 * @see .claude/agents/designer-validator.md - Agent definition
 * @see .claude/skills/dashboard-design/SKILL.md - Design patterns
 */

import noArbitraryFontSize from './rules/no-arbitrary-font-size.js';
import noRawHexColor from './rules/no-raw-hex-color.js';
import requireTabularNums from './rules/require-tabular-nums.js';
import noArbitrarySpacing from './rules/no-arbitrary-spacing.js';

export default {
  meta: {
    name: 'eslint-plugin-design',
    version: '1.0.0',
  },
  rules: {
    'no-arbitrary-font-size': noArbitraryFontSize,
    'no-raw-hex-color': noRawHexColor,
    'no-arbitrary-spacing': noArbitrarySpacing,
    'require-tabular-nums': requireTabularNums,
  },
  configs: {
    recommended: {
      plugins: ['design'],
      rules: {
        'design/no-arbitrary-font-size': 'error',
        'design/no-raw-hex-color': 'error',
        'design/no-arbitrary-spacing': 'error',
        'design/require-tabular-nums': 'warn',
      },
    },
  },
};
