import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');

const ALLOWED_PATHS = [
  'src/constants/colors.js',
  'src/constants/chartOptions.js',
  'src/constants/chartPalette.js',
  'src/design-rules.js',
  'src/index.css',
  'src/styles/tokens.css',
  'tailwind.config.js',
  'src/components/ui/',
  'src/components/layout/',
  'src/components/powerbi/',
  'src/components/insights/',
  'src/components/common/',
  'src/pages/',
  'src/context/',
  'src/adapters/',
  'src/PricingModal.jsx',
  'src/AccountSettingsModal.jsx',
  'src/PriceDistributionHeroChart.jsx',
  'src/BlurredCell.jsx',
  'src/SuppressedValue.jsx',
  'src/ValueParityPanel.jsx',
  'src/ProtectedRoute.jsx',
];

const HEX_CLASS_PATTERN = /(bg|text|border|fill|stroke)-\[#([0-9a-fA-F]{3,8})\]/g;
const ARBITRARY_PX_PATTERN = /\[[0-9]+px\]/g;

function isAllowed(filePath) {
  return ALLOWED_PATHS.some((allowed) => filePath.includes(allowed));
}

function getSourceFiles() {
  const output = execSync(
    'git ls-files "src/**/*.{js,jsx,ts,tsx,css}" "tailwind.config.js"',
    { cwd: PROJECT_ROOT }
  ).toString();
  return output.split('\n').filter(Boolean);
}

function findMatches(pattern, source) {
  const matches = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

function scanFile(filePath) {
  if (isAllowed(filePath)) {
    return [];
  }

  const absolutePath = path.join(PROJECT_ROOT, filePath);
  const source = readFileSync(absolutePath, 'utf8');

  const hexMatches = findMatches(HEX_CLASS_PATTERN, source);
  const pxMatches = findMatches(ARBITRARY_PX_PATTERN, source);

  if (hexMatches.length === 0 && pxMatches.length === 0) {
    return [];
  }

  return [
    ...hexMatches.map((match) => `[HEX] ${match}`),
    ...pxMatches.map((match) => `[PX] ${match}`),
  ];
}

function main() {
  const files = getSourceFiles();
  const violations = [];

  for (const filePath of files) {
    const matches = scanFile(filePath);
    if (matches.length > 0) {
      violations.push({ filePath, matches });
    }
  }

  if (violations.length > 0) {
    // eslint-disable-next-line no-console
    console.error('Design guard violations found:');
    for (const violation of violations) {
      // eslint-disable-next-line no-console
      console.error(`- ${violation.filePath}`);
      for (const match of violation.matches) {
        // eslint-disable-next-line no-console
        console.error(`  - ${match}`);
      }
    }
    process.exit(1);
  }
}

main();
