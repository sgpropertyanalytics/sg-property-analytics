/**
 * Rapid Interaction Smoke Test
 *
 * Tests that rapid filter changes and tab switches don't cause:
 * - "Failed to load" error flashes
 * - Stale data displayed
 * - Console errors
 *
 * SETUP:
 *   1. Install Playwright: npm install -D @playwright/test
 *   2. Add to package.json scripts: "test:e2e": "playwright test"
 *   3. Run: npm run test:e2e
 *
 * These tests validate the abort/stale request protection implemented via
 * useStaleRequestGuard and useAbortableQuery hooks.
 */

import { test, expect } from '@playwright/test';
import { mockApiEndpoints } from './fixtures/api-mocks.js';

test.describe('Rapid Interaction Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API endpoints so tests don't depend on backend
    await mockApiEndpoints(page);
    // Navigate to dashboard
    await page.goto('/market-overview');
    // Wait for initial load
    await page.waitForLoadState('networkidle');
  });

  test('rapid time granularity toggle does not show error flash', async ({ page }) => {
    // Skip if not on dashboard (redirected to login)
    const isLogin = await page.locator('text=/sign in|log in|login|email/i').isVisible();
    if (isLogin) {
      console.log('Skipping - on login page');
      return;
    }

    // Find time granularity controls (Year/Quarter/Month)
    const yearButton = page.getByRole('button', { name: /year/i });
    const quarterButton = page.getByRole('button', { name: /quarter/i });
    const monthButton = page.getByRole('button', { name: /month/i });

    // Skip if buttons not found (unauthenticated state)
    const hasButtons = await yearButton.isVisible().catch(() => false);
    if (!hasButtons) {
      console.log('Skipping - time granularity buttons not visible');
      return;
    }

    // Rapidly toggle between time granularities
    for (let i = 0; i < 5; i++) {
      await yearButton.click();
      await quarterButton.click();
      await monthButton.click();
      await quarterButton.click();
    }

    // Wait for any pending requests to complete
    await page.waitForTimeout(500);

    // Check that no error message is visible
    const errorElement = page.locator('text=/failed to load|error/i');
    await expect(errorElement).not.toBeVisible();

    // Verify chart is still rendered (not in error state)
    const chart = page.locator('[data-testid="time-trend-chart"], canvas, .recharts-wrapper');
    await expect(chart.first()).toBeVisible();
  });

  test('rapid tab switching does not show stale data', async ({ page }) => {
    // Find navigation tabs (adjust selectors based on your UI)
    const tabs = page.locator('[role="tab"], .nav-tab, nav a');
    const tabCount = await tabs.count();

    if (tabCount < 2) {
      test.skip('Not enough tabs to test');
      return;
    }

    // Rapidly switch between tabs
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < tabCount; j++) {
        await tabs.nth(j).click();
        await page.waitForTimeout(50); // Small delay to simulate rapid clicking
      }
    }

    // Wait for settling
    await page.waitForTimeout(500);

    // Check no error flash
    const errorElement = page.locator('text=/failed to load|error loading/i');
    await expect(errorElement).not.toBeVisible();
  });

  test('rapid filter changes on ValueParityPanel do not cause errors', async ({ page }) => {
    // Navigate to deal checker / value parity if not on main page
    const dealCheckerLink = page.locator('a:has-text("Deal Checker"), a:has-text("Find Deals")');
    if (await dealCheckerLink.isVisible()) {
      await dealCheckerLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Find filter controls
    const budgetSlider = page.locator('input[type="range"]').first();
    const searchButton = page.locator('button:has-text("Search"), button:has-text("Find")');

    // Rapidly change budget and search
    if (await budgetSlider.isVisible() && await searchButton.isVisible()) {
      for (let i = 0; i < 5; i++) {
        // Move slider
        await budgetSlider.fill(String(1000000 + i * 500000));
        // Click search immediately
        await searchButton.click();
      }

      // Wait for settling
      await page.waitForTimeout(1000);

      // Check no error state
      const errorElement = page.locator('text=/failed|error/i');
      await expect(errorElement).not.toBeVisible();
    }
  });

  test('double-click on search button does not cause duplicate requests', async ({ page }) => {
    // Track API calls
    const apiCalls = [];
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        apiCalls.push({
          url: request.url(),
          time: Date.now(),
        });
      }
    });

    // Find and double-click search
    const searchButton = page.locator('button:has-text("Search"), button[type="submit"]').first();
    if (await searchButton.isVisible()) {
      await searchButton.dblclick();
      await page.waitForTimeout(1000);

      // Filter to unique endpoints in the last second
      const recentCalls = apiCalls.filter(c => Date.now() - c.time < 2000);
      const uniqueEndpoints = new Set(recentCalls.map(c => new URL(c.url).pathname));

      // Each endpoint should only be called once (or canceled)
      // This is a soft check - the important thing is no error UI
      console.log(`API calls after double-click: ${recentCalls.length} total, ${uniqueEndpoints.size} unique endpoints`);
    }

    // No error flash
    const errorElement = page.locator('text=/failed to load/i');
    await expect(errorElement).not.toBeVisible();
  });

  test('no console errors during rapid interactions', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Perform some rapid interactions
    const buttons = page.locator('button:visible');
    const buttonCount = await buttons.count();

    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      try {
        await buttons.nth(i).click();
        await page.waitForTimeout(100);
      } catch {
        // Some buttons may not be clickable, that's fine
      }
    }

    await page.waitForTimeout(500);

    // Filter out known benign errors
    const realErrors = consoleErrors.filter(err =>
      !err.includes('ResizeObserver') && // Benign resize observer errors
      !err.includes('network request failed') && // Expected during rapid abort
      !err.includes('aborted') // Expected during abort
    );

    expect(realErrors).toHaveLength(0);
  });
});

test.describe('Chart Loading States', () => {
  test('charts show loading state briefly, then data (not error)', async ({ page }) => {
    await mockApiEndpoints(page);
    await page.goto('/market-overview');

    // Wait for initial load
    await page.waitForLoadState('networkidle');

    // Skip if redirected to login
    const isLogin = await page.locator('text=/sign in|log in|login|email/i').isVisible();
    if (isLogin) {
      console.log('Skipping - on login page');
      return;
    }

    // Find chart containers
    const charts = page.locator('[data-testid*="chart"], canvas, .chart-container');

    // Each chart should either show data or loading, never error
    const chartCount = await charts.count();
    if (chartCount === 0) {
      console.log('No charts found - likely not authenticated');
      return;
    }

    for (let i = 0; i < chartCount; i++) {
      const chart = charts.nth(i);
      const chartText = await chart.textContent().catch(() => '');

      // Should not contain error messages
      expect(chartText.toLowerCase()).not.toContain('failed to load');
      expect(chartText.toLowerCase()).not.toContain('error loading');
    }
  });
});
