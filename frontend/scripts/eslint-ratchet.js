#!/usr/bin/env node
/**
 * ESLint Ratchet Script
 *
 * Ensures ESLint warning count never increases above baseline.
 * This implements a "ratchet" strategy for continuous improvement:
 * - CI fails if warnings increase
 * - When warnings are fixed, update baseline to lock in progress
 *
 * Usage:
 *   node scripts/eslint-ratchet.js          # Check against baseline
 *   node scripts/eslint-ratchet.js --update # Update baseline to current count
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = join(__dirname, '..', '.eslint-warning-baseline');

function getBaselineCount() {
  try {
    const content = readFileSync(BASELINE_FILE, 'utf-8').trim();
    return parseInt(content, 10);
  } catch {
    console.error('Error: Could not read baseline file:', BASELINE_FILE);
    process.exit(1);
  }
}

function getCurrentWarningCount() {
  try {
    // Run ESLint and capture output (it exits non-zero with warnings, so we ignore exit code)
    const output = execSync('npm run lint 2>&1', {
      encoding: 'utf-8',
      cwd: join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return parseWarningCount(output);
  } catch (error) {
    // ESLint exits with code 1 when there are warnings
    if (error.stdout) {
      return parseWarningCount(error.stdout);
    }
    console.error('Error running ESLint:', error.message);
    process.exit(1);
  }
}

function parseWarningCount(output) {
  // Match "✖ X problems (Y errors, Z warnings)"
  const match = output.match(/✖\s*(\d+)\s*problems?\s*\((\d+)\s*errors?,\s*(\d+)\s*warnings?\)/);
  if (match) {
    const errors = parseInt(match[2], 10);
    const warnings = parseInt(match[3], 10);
    if (errors > 0) {
      console.error(`\n❌ ESLint found ${errors} error(s). Fix errors before checking warnings.\n`);
      process.exit(1);
    }
    return warnings;
  }
  // No problems found
  return 0;
}

function updateBaseline(count) {
  writeFileSync(BASELINE_FILE, `${count}\n`);
  console.log(`✅ Baseline updated to ${count} warnings`);
}

function main() {
  const args = process.argv.slice(2);
  const shouldUpdate = args.includes('--update');

  console.log('🔍 Running ESLint ratchet check...\n');

  const currentCount = getCurrentWarningCount();
  const baselineCount = getBaselineCount();

  console.log(`📊 Current warnings:  ${currentCount}`);
  console.log(`📏 Baseline warnings: ${baselineCount}`);
  console.log('');

  if (shouldUpdate) {
    if (currentCount < baselineCount) {
      updateBaseline(currentCount);
      console.log(`\n🎉 Great job! You reduced warnings by ${baselineCount - currentCount}!`);
    } else if (currentCount === baselineCount) {
      console.log('ℹ️  Baseline already matches current count. No update needed.');
    } else {
      console.error(`\n❌ Cannot update baseline: current count (${currentCount}) is higher than baseline (${baselineCount})`);
      console.error('   Fix the new warnings before updating the baseline.');
      process.exit(1);
    }
    return;
  }

  // Check mode
  if (currentCount > baselineCount) {
    const delta = currentCount - baselineCount;
    console.error(`❌ RATCHET FAILED: Warning count increased by ${delta}!`);
    console.error('');
    console.error('   The warning count must never increase. Please fix the new warnings');
    console.error('   before pushing your changes.');
    console.error('');
    console.error('   Run "npm run lint" to see all warnings.');
    process.exit(1);
  } else if (currentCount < baselineCount) {
    const delta = baselineCount - currentCount;
    console.log(`✅ RATCHET PASSED: Warning count decreased by ${delta}!`);
    console.log('');
    console.log(`   🎉 Great job! Consider updating the baseline to lock in your progress:`);
    console.log('   npm run lint:ratchet:update');
  } else {
    console.log('✅ RATCHET PASSED: Warning count unchanged.');
  }
}

main();
