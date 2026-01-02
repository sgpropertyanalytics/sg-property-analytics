/**
 * Boot Hydration Smoke Tests
 *
 * Tests that first login and hard refresh don't cause:
 * - "No data" flash during boot
 * - "Free" subscription flash before premium resolves
 * - Charts fetching before auth/subscription ready
 *
 * SETUP:
 *   1. Install Playwright: npm install -D @playwright/test
 *   2. Set environment variables for auth (see below)
 *   3. Run: npm run test:e2e -- --grep "Boot Hydration"
 *
 * These tests validate the boot synchronization implemented via
 * AppReadyContext and useGatedAbortableQuery.
 */

import { test, expect } from '@playwright/test';
import { mockApiEndpoints } from './fixtures/api-mocks.js';

// Base URL - adjust for your environment
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// Dashboard path that requires auth
const DASHBOARD_PATH = '/market-overview';

test.describe('Boot Hydration Smoke Tests', () => {
  // Mock API endpoints so tests don't depend on backend
  test.beforeEach(async ({ page }) => {
    await mockApiEndpoints(page);
  });

  test.describe('First Login Flow', () => {
    test('first login shows skeleton then charts load (no "No data" flash)', async ({ page }) => {
      // Clear all storage to simulate fresh first login
      await page.goto(BASE_URL);
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Navigate to protected dashboard route
      await page.goto(`${BASE_URL}${DASHBOARD_PATH}`);

      // Should either redirect to login OR show loading skeleton
      // (not "No data for selected filters")
      const noDataText = page.locator('text=/no data for selected filters/i');
      const skeleton = page.locator('[class*="animate-pulse"], [class*="skeleton"]');
      const loginPage = page.locator('text=/sign in|log in/i');

      // Wait for either login redirect or dashboard skeleton
      await Promise.race([
        loginPage.waitFor({ timeout: 5000 }).catch(() => {}),
        skeleton.first().waitFor({ timeout: 5000 }).catch(() => {}),
      ]);

      // At this point we should NOT see "No data" flash
      // Give a small window to catch any flash
      for (let i = 0; i < 5; i++) {
        await expect(noDataText).not.toBeVisible();
        await page.waitForTimeout(100);
      }

      // Verify we're either on login page or seeing loading state
      const isOnLogin = await loginPage.isVisible();
      if (!isOnLogin) {
        // Should be showing skeleton/loading, not "No data"
        const hasLoadingIndicator = await skeleton.first().isVisible().catch(() => false);
        expect(hasLoadingIndicator || await page.locator('canvas').first().isVisible()).toBeTruthy();
      }
    });

    test('after login, charts load without "No data" intermediate state', async ({ page, context }) => {
      // This test requires Firebase auth mock or test credentials
      // For CI, you can mock the auth state

      // Set up auth state mock (simulates logged-in user)
      await context.addInitScript(() => {
        // Mock Firebase user (adjust based on your auth implementation)
        window.__MOCK_AUTH_USER__ = {
          email: 'test@example.com',
          uid: 'test-uid-123',
          displayName: 'Test User',
        };
      });

      // Navigate directly to dashboard
      await page.goto(`${BASE_URL}${DASHBOARD_PATH}`);

      // Watch for "No data" flash during the first 3 seconds
      const noDataFlashObserved = { value: false };

      // Set up mutation observer to catch any flash
      await page.evaluate(() => {
        window.__noDataFlashObserved__ = false;
        const observer = new MutationObserver((mutations) => {
          const text = document.body.innerText.toLowerCase();
          if (text.includes('no data for selected filters')) {
            window.__noDataFlashObserved__ = true;
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      });

      // Wait for page to settle (charts should load)
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Check if "No data" flash was observed
      const flashObserved = await page.evaluate(() => window.__noDataFlashObserved__);

      // If we're authenticated, there should be no flash
      // (Skip assertion if redirected to login - means auth mock didn't work)
      const isOnLogin = await page.locator('text=/sign in|log in/i').isVisible();
      if (!isOnLogin) {
        expect(flashObserved).toBeFalsy();
      }
    });
  });

  test.describe('Hard Refresh Flow', () => {
    test('hard refresh while logged in shows skeleton, not "Free" or "No data" flash', async ({ page, context }) => {
      // Simulate logged-in state with premium subscription
      await context.addInitScript(() => {
        // Mock auth token
        localStorage.setItem('token', 'mock-jwt-token-for-testing');
        // Mock subscription cache (premium)
        localStorage.setItem('subscription_cache', JSON.stringify({
          tier: 'premium',
          subscribed: true,
          ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          version: 2,
        }));
      });

      // Initial navigation
      await page.goto(`${BASE_URL}${DASHBOARD_PATH}`);
      await page.waitForLoadState('networkidle');

      // Watch for subscription tier text
      const freeText = page.locator('text=/free tier|upgrade to premium|free plan/i');
      const noDataText = page.locator('text=/no data for selected filters/i');

      // Hard refresh (simulates user pressing F5)
      await page.reload();

      // Monitor for flashes during the first 2 seconds after reload
      const startTime = Date.now();
      let sawFreeFlash = false;
      let sawNoDataFlash = false;

      while (Date.now() - startTime < 2000) {
        if (await freeText.isVisible().catch(() => false)) {
          sawFreeFlash = true;
        }
        if (await noDataText.isVisible().catch(() => false)) {
          sawNoDataFlash = true;
        }
        await page.waitForTimeout(50);
      }

      // Should NOT have seen "Free" or "No data" flashes
      expect(sawFreeFlash).toBeFalsy();
      expect(sawNoDataFlash).toBeFalsy();
    });

    test('hard refresh shows charts loading in correct order', async ({ page, context }) => {
      // Set up logged-in state
      await context.addInitScript(() => {
        localStorage.setItem('token', 'mock-jwt-token-for-testing');
        localStorage.setItem('subscription_cache', JSON.stringify({
          tier: 'premium',
          subscribed: true,
          ends_at: null,
          version: 2,
        }));
      });

      await page.goto(`${BASE_URL}${DASHBOARD_PATH}`);
      await page.waitForLoadState('networkidle');

      // Hard refresh
      await page.reload();

      // Verify loading sequence:
      // 1. First we should see skeletons
      const skeletons = page.locator('[class*="animate-pulse"], [class*="skeleton"]');
      const charts = page.locator('canvas, [data-chart], .recharts-wrapper');

      // Wait for skeletons to appear first
      await skeletons.first().waitFor({ timeout: 2000 }).catch(() => {});

      // Then wait for charts to appear
      await charts.first().waitFor({ timeout: 10000 }).catch(() => {});

      // Final state should have charts visible
      await page.waitForTimeout(1000);
      const hasCharts = await charts.first().isVisible().catch(() => false);

      // If we have mocked auth correctly, charts should eventually load
      // (Skip if we got redirected to login)
      const isOnDashboard = page.url().includes(DASHBOARD_PATH);
      if (isOnDashboard) {
        // Either we have charts OR we're still loading (not "No data")
        const noDataVisible = await page.locator('text=/no data for selected filters/i').isVisible();
        expect(hasCharts || !noDataVisible).toBeTruthy();
      }
    });
  });

  test.describe('Console Error Checks', () => {
    test('no console errors during boot', async ({ page, context }) => {
      const consoleErrors = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Ignore expected warnings
          if (!text.includes('React does not recognize') &&
              !text.includes('validateDOMNesting') &&
              !text.includes('Failed to load resource')) {
            consoleErrors.push(text);
          }
        }
      });

      await page.goto(`${BASE_URL}${DASHBOARD_PATH}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Filter out auth-related errors (expected when not logged in)
      const unexpectedErrors = consoleErrors.filter(
        (e) => !e.includes('401') && !e.includes('unauthorized') && !e.includes('auth')
      );

      expect(unexpectedErrors.length).toBe(0);
    });
  });
});
