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
      'no-empty': ['error', { allowEmptyCatch: false }], // Catch blocks must handle errors
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
  // Stricter spacing rules for new primitives/patterns
  {
    files: [
      'src/components/primitives/**/*.{js,jsx,ts,tsx}',
      'src/components/patterns/**/*.{js,jsx,ts,tsx}',
    ],
    plugins: {
      design: designPlugin,
    },
    rules: {
      'design/no-arbitrary-spacing': 'error',
    },
  },

  // =============================================================================
  // AUTH SINGLE-WRITER FRAMEWORK (Phase 0)
  // =============================================================================
  // These rules enforce the single-writer pattern for auth/subscription state.
  // All state mutations must go through the authCoordinatorReducer.
  // See: docs/plans/2026-01-14-auth-single-writer-framework.md
  //
  // MIGRATION ESCAPE HATCH:
  // During migration, use this comment pattern (sparingly):
  //   // eslint-disable-next-line no-restricted-syntax -- MIGRATION_ONLY: remove by Phase 3
  // Track count with: grep -c "MIGRATION_ONLY" src/context/*.jsx
  // Success = count goes to zero.
  //
  // AuthContext.jsx: Ban useState entirely - all state via useReducer
  {
    files: ['src/context/AuthContext.jsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'react',
          importNames: ['useState'],
          message: 'useState is banned in AuthContext. Use useReducer with authCoordinatorReducer. See docs/plans/2026-01-14-auth-single-writer-framework.md',
        }],
      }],
    },
  },
  // SubscriptionContext.jsx: Ban auth state setters, allow UI state (paywall modal)
  // Banned: setSubscription, setStatus, setLoading, setFetchError, setHasCachedSubscription
  // Allowed: setShowPricingModal, setUpsellContext (pure UI state)
  {
    files: ['src/context/SubscriptionContext.jsx'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression[callee.name='setSubscription']",
          message: 'setSubscription is banned. Use dispatch() with authCoordinatorReducer.',
        },
        {
          selector: "CallExpression[callee.name='setStatus']",
          message: 'setStatus is banned. Use dispatch() with authCoordinatorReducer.',
        },
        {
          selector: "CallExpression[callee.name='setFetchError']",
          message: 'setFetchError is banned. Use dispatch() with authCoordinatorReducer.',
        },
        {
          selector: "CallExpression[callee.name='setHasCachedSubscription']",
          message: 'setHasCachedSubscription is banned. Use dispatch() with authCoordinatorReducer.',
        },
        // Note: setLoading banned via pattern matching to avoid false positives
        {
          selector: "CallExpression[callee.name='setLoading'][arguments.0.type='Literal']",
          message: 'setLoading is banned for auth state. Use dispatch() with authCoordinatorReducer.',
        },
        {
          selector: "CallExpression[callee.name='setLoading'][arguments.0.type='Identifier']",
          message: 'setLoading is banned for auth state. Use dispatch() with authCoordinatorReducer.',
        },
      ],
    },
  },

  // Ignore patterns
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.cjs', 'eslint-plugin-design/'],
  },
];
