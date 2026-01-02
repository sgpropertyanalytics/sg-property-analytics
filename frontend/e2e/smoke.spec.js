/**
 * Critical Path Smoke Tests
 *
 * Simple tests that verify each page loads without crashing.
 * These catch React Context errors, missing providers, and white-page crashes.
 *
 * Success criteria:
 * - No React error boundary visible
 * - No console errors (excluding expected network failures)
 * - Key element visible on page
 *
 * RUN: npm run test:e2e -- --grep "Smoke"
 */

import { test, expect } from '@playwright/test';

// Critical pages to test (from CLAUDE.md routes)
const CRITICAL_PAGES = [
  { path: '/', name: 'Landing', keyElement: 'main, [data-testid="landing"], .landing' },
  { path: '/market-overview', name: 'Market Overview', keyElement: 'canvas, [data-testid="kpi-cards"], .chart-container' },
  { path: '/district-overview', name: 'District Overview', keyElement: 'canvas, [data-testid="district"], .chart-container' },
  { path: '/new-launch-market', name: 'New Launch Market', keyElement: 'canvas, [data-testid="new-launch"], .chart-container' },
  { path: '/explore', name: 'Explore', keyElement: '[data-testid="explore"], .explore, main' },
];

test.describe('Smoke Tests - Critical Pages Load', () => {
  for (const page of CRITICAL_PAGES) {
    test(`${page.name} (${page.path}) loads without crash`, async ({ page: browserPage }) => {
      const consoleErrors = [];

      // Collect console errors
      browserPage.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Ignore expected errors
          if (!text.includes('401') &&
              !text.includes('Failed to load resource') &&
              !text.includes('net::ERR')) {
            consoleErrors.push(text);
          }
        }
      });

      // Navigate to page
      await browserPage.goto(page.path);

      // Wait for page to settle
      await browserPage.waitForLoadState('domcontentloaded');
      await browserPage.waitForTimeout(1000);

      // 1. Check NO React error boundary / crash screen
      const errorBoundary = browserPage.locator(
        'text=/something went wrong|error boundary|application error|uncaught error/i'
      );
      await expect(errorBoundary).not.toBeVisible();

      // 2. Check NO "white page" (body has content)
      const bodyContent = await browserPage.locator('body').innerText();
      expect(bodyContent.length).toBeGreaterThan(10);

      // 3. Check key element visible (or login redirect - both acceptable)
      const keyElement = browserPage.locator(page.keyElement);
      const loginPage = browserPage.locator('text=/sign in|log in|login/i');

      // Either key element OR login page should be visible
      const keyVisible = await keyElement.first().isVisible().catch(() => false);
      const loginVisible = await loginPage.first().isVisible().catch(() => false);

      expect(keyVisible || loginVisible).toBeTruthy();

      // 4. No unexpected console errors
      const criticalErrors = consoleErrors.filter(
        (e) => e.includes('useFilterState') ||
               e.includes('must be used within') ||
               e.includes('Cannot read properties of') ||
               e.includes('is not a function')
      );

      if (criticalErrors.length > 0) {
        console.error('Critical console errors:', criticalErrors);
      }
      expect(criticalErrors.length).toBe(0);
    });
  }
});

test.describe('Smoke Tests - Filter Interaction', () => {
  test('filter selection does not crash page', async ({ page }) => {
    // Navigate to chart-heavy page
    await page.goto('/market-overview');
    await page.waitForLoadState('networkidle');

    // Check if we're on the dashboard (not redirected to login)
    const isOnDashboard = !await page.locator('text=/sign in|log in/i').isVisible();

    if (!isOnDashboard) {
      test.skip('Redirected to login - auth required');
      return;
    }

    // Find any filter/dropdown and interact
    const filterSelects = page.locator('select, [role="combobox"], [data-testid*="filter"]');
    const filterCount = await filterSelects.count();

    if (filterCount > 0) {
      // Click first filter
      await filterSelects.first().click();
      await page.waitForTimeout(500);

      // Page should not crash
      const errorBoundary = page.locator('text=/something went wrong|error boundary/i');
      await expect(errorBoundary).not.toBeVisible();

      // Charts should still be present
      const charts = page.locator('canvas');
      const chartCount = await charts.count();
      expect(chartCount).toBeGreaterThan(0);
    }
  });
});

test.describe('Smoke Tests - Navigation', () => {
  test('can navigate between pages without crash', async ({ page }) => {
    // Start at landing
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to market overview
    await page.goto('/market-overview');
    await page.waitForLoadState('domcontentloaded');

    // Check no crash
    const errorBoundary = page.locator('text=/something went wrong|error boundary/i');
    await expect(errorBoundary).not.toBeVisible();

    // Navigate to district overview
    await page.goto('/district-overview');
    await page.waitForLoadState('domcontentloaded');
    await expect(errorBoundary).not.toBeVisible();

    // Navigate back to market overview
    await page.goto('/market-overview');
    await page.waitForLoadState('domcontentloaded');
    await expect(errorBoundary).not.toBeVisible();
  });
});
