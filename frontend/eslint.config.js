import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * ESLint Configuration (Flat Config for ESLint 9+)
 *
 * Key rules:
 * - no-undef: Catches undefined variables (like 'updating' leftover from refactors)
 * - react-hooks/rules-of-hooks: Enforces React hooks rules
 * - react-hooks/exhaustive-deps: Warns about missing useEffect dependencies
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

  // React configuration
  {
    files: ['src/**/*.{js,jsx}'],
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
      // CRITICAL: Catches undefined variables like 'updating' leftover from refactors
      'no-undef': 'error',

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

  // Ignore patterns
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.cjs'],
  },
];
