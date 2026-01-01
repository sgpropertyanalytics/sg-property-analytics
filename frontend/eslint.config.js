import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import designPlugin from './eslint-plugin-design/index.js';

/**
 * ESLint Configuration (Flat Config for ESLint 9+)
 *
 * Key rules:
 * - no-undef: Catches undefined variables (like 'updating' leftover from refactors)
 * - react-hooks/rules-of-hooks: Enforces React hooks rules
 * - react-hooks/exhaustive-deps: Warns about missing useEffect dependencies
 * - design/*: Design system enforcement (typography, colors, formatting)
 *
 * @see eslint-plugin-design/ - Custom design rules
 * @see src/design-rules.js - Design system source of truth
 */
// Vitest globals for test files
const vitestGlobals = {
  describe: 'readonly',
  test: 'readonly',
  it: 'readonly',
  expect: 'readonly',
  vi: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
};

export default [
  // Base recommended rules
  js.configs.recommended,

  // Test files configuration (must come before React config to add globals)
  {
    files: ['src/**/*.test.{js,jsx}', 'src/**/__tests__/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...vitestGlobals,
      },
    },
  },

  // Guardrail: prevent undefined hooks/variables (e.g., useEffect without import)
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-undef': 'error',
    },
  },

  // React configuration
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        // Vite/build globals
        process: 'readonly',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React-specific
      'react/react-in-jsx-scope': 'off', // Not needed in React 17+
      'react/prop-types': 'off', // Using TypeScript checkJs instead
      'react/display-name': 'off',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',

      // Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // General
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // TypeScript/TSX parsing support
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // Design system enforcement
  // Validates typography, colors, and numeric formatting in UI components
  {
    files: ['src/components/**/*.{js,jsx,ts,tsx}', 'src/pages/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      design: designPlugin,
    },
    rules: {
      // Typography: Disallow arbitrary font sizes (use Tailwind scale)
      'design/no-arbitrary-font-size': 'error',
      // Colors: Disallow raw hex colors (import from constants)
      'design/no-raw-hex-color': 'error',
      // Formatting: Require tabular-nums on numeric displays
      'design/require-tabular-nums': 'warn',
    },
  },

  // Ignore patterns
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.cjs', 'eslint-plugin-design/'],
  },
];
