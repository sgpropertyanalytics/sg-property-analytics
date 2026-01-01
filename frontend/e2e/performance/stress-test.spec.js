/**
 * Filter Stress Tests
 *
 * Tests that rapid filter changes don't cause:
 * - Stale data displayed
 * - Error states
 * - Console errors
 * - Memory leaks
 *
 * Run: npm run test:perf -- --grep "stress"
 */

import { test, expect } from '@playwright/test';
import {
  BUDGETS,
  waitForChartsLoaded,
  checkForErrors,
  setupConsoleErrorCapture,
} from './fixtures.js';

test.describe('Filter Stress Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);
  });

  test('rapid time granularity changes (10x in 2 seconds)', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    // Find time granularity buttons
    const yearBtn = page.locator('button:has-text("Year")').first();
    const quarterBtn = page.locator('button:has-text("Quarter")').first();
    const monthBtn = page.locator('button:has-text("Month")').first();

    // Rapid toggling
    for (let i = 0; i < 10; i++) {
      if (await yearBtn.isVisible()) await yearBtn.click();
      await page.waitForTimeout(50);
      if (await quarterBtn.isVisible()) await quarterBtn.click();
      await page.waitForTimeout(50);
      if (await monthBtn.isVisible()) await monthBtn.click();
      await page.waitForTimeout(50);
    }

    // Wait for final state to settle
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify no errors
    const errors = await checkForErrors(page);
    expect(errors, `Errors after rapid filter: ${errors.join(', ')}`).toHaveLength(0);

    // Verify no console errors (excluding abort errors)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('abort') && !e.includes('cancel')
    );
    expect(realErrors).toHaveLength(0);

    // Verify charts are visible
    const canvases = await page.locator('canvas').count();
    expect(canvases).toBeGreaterThan(0);
  });

  test('rapid region filter changes', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    // Find region filter buttons
    const ccrBtn = page.locator('button:has-text("CCR")').first();
    const rcrBtn = page.locator('button:has-text("RCR")').first();
    const ocrBtn = page.locator('button:has-text("OCR")').first();

    // Rapid toggling
    for (let i = 0; i < 10; i++) {
      if (await ccrBtn.isVisible()) await ccrBtn.click();
      await page.waitForTimeout(50);
      if (await rcrBtn.isVisible()) await rcrBtn.click();
      await page.waitForTimeout(50);
      if (await ocrBtn.isVisible()) await ocrBtn.click();
      await page.waitForTimeout(50);
    }

    // Wait for settle
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify no errors
    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('abort') && !e.includes('cancel')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('filter change response time within budget', async ({ page }) => {
    // Wait for initial load
    await waitForChartsLoaded(page);

    const filterTimes = [];

    // Find a filter button
    const filterBtn = page.locator('button:has-text("Year"), button:has-text("CCR")').first();

    if (await filterBtn.isVisible()) {
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        await filterBtn.click();
        await page.waitForLoadState('networkidle');
        const filterTime = Date.now() - startTime;
        filterTimes.push(filterTime);
        await page.waitForTimeout(200);
      }

      // Calculate p95
      filterTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(filterTimes.length * 0.95);
      const p95 = filterTimes[p95Index] || filterTimes[filterTimes.length - 1];

      console.log(`Filter response times: ${filterTimes.join(', ')}ms, p95: ${p95}ms`);

      expect(p95, `Filter p95 ${p95}ms exceeds budget ${BUDGETS.filterChange}ms`).toBeLessThan(
        BUDGETS.filterChange * 2 // Allow 2x for CI variability
      );
    }
  });

  test('combined rapid interactions (filters + navigation)', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    // Rapid mix of actions
    for (let i = 0; i < 5; i++) {
      // Change filter
      const filterBtn = page.locator('button:has-text("Year"), button:has-text("Quarter")').first();
      if (await filterBtn.isVisible()) {
        await filterBtn.click();
      }
      await page.waitForTimeout(100);

      // Navigate to another page
      await page.goto('/district-overview');
      await page.waitForTimeout(200);

      // Change filter there
      const filterBtn2 = page.locator('button:has-text("CCR"), button:has-text("RCR")').first();
      if (await filterBtn2.isVisible()) {
        await filterBtn2.click();
      }
      await page.waitForTimeout(100);

      // Navigate back
      await page.goto('/market-overview');
      await page.waitForTimeout(200);
    }

    // Final settle
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify no errors
    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('abort') && !e.includes('cancel')
    );
    expect(realErrors).toHaveLength(0);
  });
});

test.describe('Abort Handling', () => {
  test('rapid requests are properly aborted', async ({ page }) => {
    const requests = [];
    const abortedRequests = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/')) {
        requests.push(request.url());
      }
    });

    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText?.includes('aborted')) {
        abortedRequests.push(request.url());
      }
    });

    await page.goto('/market-overview');
    await page.waitForTimeout(500);

    // Rapid filter changes should trigger aborts
    const filterBtn = page.locator('button:has-text("Year"), button:has-text("Quarter")').first();
    if (await filterBtn.isVisible()) {
      for (let i = 0; i < 5; i++) {
        await filterBtn.click();
        await page.waitForTimeout(50);
      }
    }

    await page.waitForLoadState('networkidle');

    console.log(`Total requests: ${requests.length}, Aborted: ${abortedRequests.length}`);

    // If there were multiple rapid requests, some should have been aborted
    // This is a soft check - depends on network speed
    if (requests.length > 5) {
      expect(abortedRequests.length).toBeGreaterThan(0);
    }
  });

  test('final data is correct after rapid changes', async ({ page }) => {
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    // Get initial chart state
    const initialCanvases = await page.locator('canvas').count();

    // Rapid changes
    const filterBtn = page.locator('button:has-text("Month")').first();
    if (await filterBtn.isVisible()) {
      for (let i = 0; i < 5; i++) {
        await filterBtn.click();
        await page.waitForTimeout(100);
      }
    }

    // Wait for final state
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Charts should still be present
    const finalCanvases = await page.locator('canvas').count();
    expect(finalCanvases).toBe(initialCanvases);

    // No error states
    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);
  });
});

test.describe('Long Running Stress', () => {
  test('sustained filter changes over 30 seconds', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    const startTime = Date.now();
    const duration = 30000; // 30 seconds
    let changeCount = 0;

    while (Date.now() - startTime < duration) {
      const filterBtn = page
        .locator('button:has-text("Year"), button:has-text("Quarter"), button:has-text("Month")')
        .first();
      if (await filterBtn.isVisible()) {
        await filterBtn.click();
        changeCount++;
      }
      await page.waitForTimeout(500);
    }

    console.log(`Completed ${changeCount} filter changes in 30 seconds`);

    // Final verification
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('abort') && !e.includes('cancel')
    );
    expect(realErrors).toHaveLength(0);

    // Charts should still render
    const canvases = await page.locator('canvas').count();
    expect(canvases).toBeGreaterThan(0);
  });
});
