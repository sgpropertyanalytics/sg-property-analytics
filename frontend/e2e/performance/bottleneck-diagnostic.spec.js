/**
 * Bottleneck Diagnostic Tests
 *
 * Traces end-to-end data delivery to identify WHERE slowness occurs:
 * - Backend processing time (from API response elapsedMs)
 * - Network latency (request → response)
 * - Frontend processing time (response → chart render)
 *
 * Identifies:
 * - Slowest API endpoints
 * - Slowest charts to render
 * - Backend vs Frontend bottleneck ratio
 *
 * Run: npm run test:perf -- --grep "bottleneck"
 */

import { test, expect } from '@playwright/test';
import {
  PAGES,
  FILTERS,
  waitForChartsLoaded,
  countVisibleCharts,
  checkForErrors,
  setupConsoleErrorCapture,
} from './fixtures.js';

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Tracks timing for a single API request
 */
class RequestTiming {
  constructor(url, method = 'GET') {
    this.url = url;
    this.method = method;
    this.endpoint = this.extractEndpoint(url);

    // Timestamps
    this.requestStart = null;
    this.responseStart = null;
    this.responseEnd = null;

    // Parsed from response
    this.backendElapsedMs = null;
    this.responseSize = null;
    this.status = null;

    // Calculated
    this.networkTime = null;
    this.totalTime = null;
  }

  extractEndpoint(url) {
    try {
      const parsed = new URL(url);
      return parsed.pathname.replace(/^\/api/, '');
    } catch {
      return url;
    }
  }

  complete(response, body) {
    this.responseEnd = Date.now();
    this.status = response.status();
    this.totalTime = this.responseEnd - this.requestStart;
    this.networkTime = this.responseStart - this.requestStart;

    // Try to parse backend timing from response
    try {
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }
      if (body?.meta?.elapsedMs) {
        this.backendElapsedMs = body.meta.elapsedMs;
      } else if (body?.elapsedMs) {
        this.backendElapsedMs = body.elapsedMs;
      }
      this.responseSize = JSON.stringify(body).length;
    } catch {
      // Non-JSON response
    }
  }

  getBreakdown() {
    const backend = this.backendElapsedMs || 0;
    const network = this.networkTime || 0;
    const frontend = Math.max(0, this.totalTime - backend - network);

    return {
      endpoint: this.endpoint,
      total: this.totalTime,
      backend,
      network,
      frontend,
      responseSize: this.responseSize,
      status: this.status,
      bottleneck: this.identifyBottleneck(backend, network, frontend),
    };
  }

  identifyBottleneck(backend, network, frontend) {
    const max = Math.max(backend, network, frontend);
    if (max === backend) return 'BACKEND';
    if (max === network) return 'NETWORK';
    return 'FRONTEND';
  }
}

/**
 * Collects and analyzes all request timings
 */
class BottleneckAnalyzer {
  constructor() {
    this.requests = new Map(); // requestId -> RequestTiming
    this.completedRequests = [];
    this.pageLoadStart = null;
    this.chartsRenderedTime = null;
  }

  startPageLoad() {
    this.pageLoadStart = Date.now();
    this.requests.clear();
    this.completedRequests = [];
  }

  trackRequest(request) {
    if (!request.url().includes('/api/')) return null;

    const timing = new RequestTiming(request.url(), request.method());
    timing.requestStart = Date.now();

    const id = `${request.url()}-${timing.requestStart}`;
    this.requests.set(id, timing);

    return id;
  }

  trackResponse(requestId, response) {
    const timing = this.requests.get(requestId);
    if (timing) {
      timing.responseStart = Date.now();
    }
  }

  async completeRequest(requestId, response) {
    const timing = this.requests.get(requestId);
    if (!timing) return;

    try {
      const body = await response.text();
      timing.complete(response, body);
      this.completedRequests.push(timing);
    } catch {
      // Response already consumed
    }
  }

  chartsRendered() {
    this.chartsRenderedTime = Date.now();
  }

  analyze() {
    const breakdowns = this.completedRequests.map((r) => r.getBreakdown());

    // Aggregate stats
    const totalBackend = breakdowns.reduce((a, b) => a + b.backend, 0);
    const totalNetwork = breakdowns.reduce((a, b) => a + b.network, 0);
    const totalFrontend = breakdowns.reduce((a, b) => a + b.frontend, 0);
    const totalTime = totalBackend + totalNetwork + totalFrontend;

    // Find slowest endpoints
    const sortedByTotal = [...breakdowns].sort((a, b) => b.total - a.total);
    const sortedByBackend = [...breakdowns].sort((a, b) => b.backend - a.backend);

    // Bottleneck distribution
    const bottleneckCounts = { BACKEND: 0, NETWORK: 0, FRONTEND: 0 };
    breakdowns.forEach((b) => bottleneckCounts[b.bottleneck]++);

    // Page-level timing
    const pageLoadTime = this.chartsRenderedTime - this.pageLoadStart;
    const apiTime = Math.max(...breakdowns.map((b) => b.total), 0);
    const renderTime = pageLoadTime - apiTime;

    return {
      summary: {
        totalRequests: breakdowns.length,
        pageLoadTime,
        apiTime,
        renderTime,
        breakdown: {
          backend: totalBackend,
          network: totalNetwork,
          frontend: totalFrontend,
          total: totalTime,
        },
        percentages: {
          backend: totalTime > 0 ? Math.round((totalBackend / totalTime) * 100) : 0,
          network: totalTime > 0 ? Math.round((totalNetwork / totalTime) * 100) : 0,
          frontend: totalTime > 0 ? Math.round((totalFrontend / totalTime) * 100) : 0,
        },
        bottleneckDistribution: bottleneckCounts,
      },
      slowestEndpoints: sortedByTotal.slice(0, 5),
      slowestBackend: sortedByBackend.slice(0, 5),
      allEndpoints: breakdowns,
    };
  }

  print() {
    const analysis = this.analyze();

    console.log('\n' + '='.repeat(70));
    console.log('BOTTLENECK ANALYSIS');
    console.log('='.repeat(70));

    console.log('\n📊 PAGE LOAD BREAKDOWN:');
    console.log(`   Total Page Load:    ${analysis.summary.pageLoadTime}ms`);
    console.log(`   API Time (max):     ${analysis.summary.apiTime}ms`);
    console.log(`   Render Time:        ${analysis.summary.renderTime}ms`);

    console.log('\n📡 API REQUEST BREAKDOWN:');
    console.log(`   Total Requests:     ${analysis.summary.totalRequests}`);
    console.log(`   Backend Time:       ${analysis.summary.breakdown.backend}ms (${analysis.summary.percentages.backend}%)`);
    console.log(`   Network Time:       ${analysis.summary.breakdown.network}ms (${analysis.summary.percentages.network}%)`);
    console.log(`   Frontend Time:      ${analysis.summary.breakdown.frontend}ms (${analysis.summary.percentages.frontend}%)`);

    console.log('\n🔍 BOTTLENECK DISTRIBUTION:');
    console.log(`   Backend-bound:      ${analysis.summary.bottleneckDistribution.BACKEND} requests`);
    console.log(`   Network-bound:      ${analysis.summary.bottleneckDistribution.NETWORK} requests`);
    console.log(`   Frontend-bound:     ${analysis.summary.bottleneckDistribution.FRONTEND} requests`);

    console.log('\n🐢 SLOWEST ENDPOINTS (by total time):');
    console.table(
      analysis.slowestEndpoints.map((e) => ({
        Endpoint: e.endpoint,
        Total: `${e.total}ms`,
        Backend: `${e.backend}ms`,
        Network: `${e.network}ms`,
        Bottleneck: e.bottleneck,
      }))
    );

    console.log('\n🔥 SLOWEST BACKEND PROCESSING:');
    console.table(
      analysis.slowestBackend.map((e) => ({
        Endpoint: e.endpoint,
        Backend: `${e.backend}ms`,
        Total: `${e.total}ms`,
        Size: e.responseSize ? `${Math.round(e.responseSize / 1024)}KB` : 'N/A',
      }))
    );

    // Primary bottleneck recommendation
    const { backend, network, frontend } = analysis.summary.percentages;
    console.log('\n💡 RECOMMENDATION:');
    if (backend > 50) {
      console.log('   ⚠️  BACKEND is the primary bottleneck');
      console.log('   → Optimize SQL queries, add caching, check DB indexes');
    } else if (network > 40) {
      console.log('   ⚠️  NETWORK is the primary bottleneck');
      console.log('   → Check server location, enable compression, reduce payload size');
    } else if (frontend > 40) {
      console.log('   ⚠️  FRONTEND is the primary bottleneck');
      console.log('   → Optimize React renders, memoize components, reduce transforms');
    } else {
      console.log('   ✅ Load is balanced across backend/network/frontend');
    }

    console.log('\n' + '='.repeat(70));

    return analysis;
  }
}

/**
 * Setup request interception for bottleneck analysis
 */
function setupBottleneckTracking(page, analyzer) {
  const pendingRequests = new Map();

  page.on('request', (request) => {
    const id = analyzer.trackRequest(request);
    if (id) {
      pendingRequests.set(request.url() + request.method(), id);
    }
  });

  page.on('response', async (response) => {
    const key = response.url() + response.request().method();
    const id = pendingRequests.get(key);
    if (id) {
      analyzer.trackResponse(id, response);
      await analyzer.completeRequest(id, response);
      pendingRequests.delete(key);
    }
  });
}

// ============================================================================
// DIAGNOSTIC TESTS
// ============================================================================

test.describe('Bottleneck Diagnostic - Page Load Analysis', () => {
  for (const pageConfig of PAGES) {
    test(`${pageConfig.name} - end-to-end breakdown`, async ({ page }) => {
      const analyzer = new BottleneckAnalyzer();
      setupBottleneckTracking(page, analyzer);

      analyzer.startPageLoad();
      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);
      analyzer.chartsRendered();

      const analysis = analyzer.print();

      // Verify page loaded
      const chartCount = await countVisibleCharts(page);
      expect(chartCount).toBeGreaterThan(0);

      const errors = await checkForErrors(page);
      expect(errors).toHaveLength(0);

      // Record key metrics for comparison
      console.log(`\n📈 ${pageConfig.name} Summary:`);
      console.log(`   Charts: ${chartCount}`);
      console.log(`   API Requests: ${analysis.summary.totalRequests}`);
      console.log(`   Primary Bottleneck: ${Object.entries(analysis.summary.bottleneckDistribution)
        .sort((a, b) => b[1] - a[1])[0][0]}`);
    });
  }
});

test.describe('Bottleneck Diagnostic - Filter Change Analysis', () => {
  test('Market Overview - filter change breakdown', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    // Now track filter change
    const analyzer = new BottleneckAnalyzer();
    setupBottleneckTracking(page, analyzer);

    // Apply CCR filter
    analyzer.startPageLoad();
    const ccrBtn = page.locator(FILTERS.segment.options[0].selector).first();
    if (await ccrBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await ccrBtn.click();
      await page.waitForLoadState('networkidle');
      await waitForChartsLoaded(page);
    }
    analyzer.chartsRendered();

    console.log('\n🔄 FILTER CHANGE: CCR');
    analyzer.print();

    // Apply bedroom filter
    const analyzer2 = new BottleneckAnalyzer();
    setupBottleneckTracking(page, analyzer2);

    analyzer2.startPageLoad();
    const br2Btn = page.locator(FILTERS.bedroom.options[1].selector).first();
    if (await br2Btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await br2Btn.click();
      await page.waitForLoadState('networkidle');
      await waitForChartsLoaded(page);
    }
    analyzer2.chartsRendered();

    console.log('\n🔄 FILTER CHANGE: 2BR');
    analyzer2.print();

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

test.describe('Bottleneck Diagnostic - Cross-Page Comparison', () => {
  test('compare all pages side-by-side', async ({ page }) => {
    const pageResults = [];

    for (const pageConfig of PAGES) {
      const analyzer = new BottleneckAnalyzer();
      setupBottleneckTracking(page, analyzer);

      analyzer.startPageLoad();
      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);
      analyzer.chartsRendered();

      const analysis = analyzer.analyze();
      const chartCount = await countVisibleCharts(page);

      pageResults.push({
        page: pageConfig.name,
        route: pageConfig.route,
        loadTime: analysis.summary.pageLoadTime,
        apiTime: analysis.summary.apiTime,
        renderTime: analysis.summary.renderTime,
        requests: analysis.summary.totalRequests,
        charts: chartCount,
        backendPct: analysis.summary.percentages.backend,
        networkPct: analysis.summary.percentages.network,
        frontendPct: analysis.summary.percentages.frontend,
        primaryBottleneck: Object.entries(analysis.summary.bottleneckDistribution)
          .sort((a, b) => b[1] - a[1])[0][0],
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('CROSS-PAGE COMPARISON');
    console.log('='.repeat(80));

    console.log('\n📊 PAGE LOAD TIMES:');
    console.table(
      pageResults.map((p) => ({
        Page: p.page,
        'Load Time': `${p.loadTime}ms`,
        'API Time': `${p.apiTime}ms`,
        'Render Time': `${p.renderTime}ms`,
        Requests: p.requests,
        Charts: p.charts,
      }))
    );

    console.log('\n📈 BOTTLENECK BREAKDOWN (%):');
    console.table(
      pageResults.map((p) => ({
        Page: p.page,
        Backend: `${p.backendPct}%`,
        Network: `${p.networkPct}%`,
        Frontend: `${p.frontendPct}%`,
        'Primary Issue': p.primaryBottleneck,
      }))
    );

    // Find slowest page
    const slowest = pageResults.sort((a, b) => b.loadTime - a.loadTime)[0];
    console.log(`\n🐢 Slowest Page: ${slowest.page} (${slowest.loadTime}ms)`);
    console.log(`   Primary Bottleneck: ${slowest.primaryBottleneck}`);

    // Find fastest page
    const fastest = pageResults.sort((a, b) => a.loadTime - b.loadTime)[0];
    console.log(`\n🚀 Fastest Page: ${fastest.page} (${fastest.loadTime}ms)`);
  });
});

test.describe('Bottleneck Diagnostic - Endpoint Deep Dive', () => {
  test('identify slowest endpoints across all pages', async ({ page }) => {
    const allEndpoints = [];

    for (const pageConfig of PAGES) {
      const analyzer = new BottleneckAnalyzer();
      setupBottleneckTracking(page, analyzer);

      analyzer.startPageLoad();
      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);
      analyzer.chartsRendered();

      const analysis = analyzer.analyze();
      analysis.allEndpoints.forEach((e) => {
        allEndpoints.push({
          ...e,
          page: pageConfig.name,
        });
      });
    }

    // Deduplicate and aggregate by endpoint
    const endpointStats = new Map();
    allEndpoints.forEach((e) => {
      const key = e.endpoint;
      if (!endpointStats.has(key)) {
        endpointStats.set(key, {
          endpoint: key,
          calls: 0,
          totalTime: 0,
          maxTime: 0,
          avgBackend: 0,
          totalBackend: 0,
          pages: new Set(),
        });
      }
      const stats = endpointStats.get(key);
      stats.calls++;
      stats.totalTime += e.total;
      stats.maxTime = Math.max(stats.maxTime, e.total);
      stats.totalBackend += e.backend;
      stats.pages.add(e.page);
    });

    // Calculate averages
    const endpointList = Array.from(endpointStats.values()).map((s) => ({
      ...s,
      avgTime: Math.round(s.totalTime / s.calls),
      avgBackend: Math.round(s.totalBackend / s.calls),
      pages: Array.from(s.pages).join(', '),
    }));

    // Sort by max time (worst case)
    const sortedByMax = [...endpointList].sort((a, b) => b.maxTime - a.maxTime);

    console.log('\n' + '='.repeat(80));
    console.log('ENDPOINT PERFORMANCE ANALYSIS');
    console.log('='.repeat(80));

    console.log('\n🔥 SLOWEST ENDPOINTS (by max time):');
    console.table(
      sortedByMax.slice(0, 10).map((e) => ({
        Endpoint: e.endpoint,
        Calls: e.calls,
        'Max Time': `${e.maxTime}ms`,
        'Avg Time': `${e.avgTime}ms`,
        'Avg Backend': `${e.avgBackend}ms`,
        'Used By': e.pages.substring(0, 40) + (e.pages.length > 40 ? '...' : ''),
      }))
    );

    // Sort by average backend time
    const sortedByBackend = [...endpointList].sort((a, b) => b.avgBackend - a.avgBackend);

    console.log('\n🗄️ SLOWEST BACKEND PROCESSING (avg):');
    console.table(
      sortedByBackend.slice(0, 10).map((e) => ({
        Endpoint: e.endpoint,
        Calls: e.calls,
        'Avg Backend': `${e.avgBackend}ms`,
        'Avg Total': `${e.avgTime}ms`,
      }))
    );

    // Identify endpoints called on every page
    const universalEndpoints = endpointList.filter((e) => e.calls >= PAGES.length);
    if (universalEndpoints.length > 0) {
      console.log('\n🌐 UNIVERSAL ENDPOINTS (called on every page):');
      console.table(
        universalEndpoints.map((e) => ({
          Endpoint: e.endpoint,
          Calls: e.calls,
          'Avg Time': `${e.avgTime}ms`,
          Impact: e.calls >= PAGES.length ? 'HIGH (optimize first)' : 'MEDIUM',
        }))
      );
    }
  });
});

test.describe('Bottleneck Diagnostic - Real-Time Monitoring', () => {
  test('monitor rapid filter changes and identify degradation', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    const measurements = [];

    // Rapid filter changes with measurement
    for (let i = 0; i < 10; i++) {
      const analyzer = new BottleneckAnalyzer();
      setupBottleneckTracking(page, analyzer);

      analyzer.startPageLoad();

      // Cycle through segments
      const segmentIndex = i % 3;
      const btn = page.locator(FILTERS.segment.options[segmentIndex].selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click();
        await page.waitForLoadState('networkidle');
        await waitForChartsLoaded(page);
      }

      analyzer.chartsRendered();
      const analysis = analyzer.analyze();

      measurements.push({
        iteration: i + 1,
        filter: FILTERS.segment.options[segmentIndex].label,
        loadTime: analysis.summary.pageLoadTime,
        backendPct: analysis.summary.percentages.backend,
        requests: analysis.summary.totalRequests,
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log('RAPID FILTER CHANGE MONITORING');
    console.log('='.repeat(70));

    console.table(measurements);

    // Check for degradation
    const firstHalf = measurements.slice(0, 5);
    const secondHalf = measurements.slice(5);

    const avgFirst = Math.round(firstHalf.reduce((a, b) => a + b.loadTime, 0) / 5);
    const avgSecond = Math.round(secondHalf.reduce((a, b) => a + b.loadTime, 0) / 5);

    console.log(`\n📉 DEGRADATION CHECK:`);
    console.log(`   First 5 avg:  ${avgFirst}ms`);
    console.log(`   Last 5 avg:   ${avgSecond}ms`);
    console.log(`   Difference:   ${avgSecond - avgFirst}ms (${avgSecond > avgFirst * 1.2 ? '⚠️ DEGRADING' : '✅ STABLE'})`);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

test.describe('Bottleneck Diagnostic - Payload Size Analysis', () => {
  test('analyze response payload sizes', async ({ page }) => {
    const analyzer = new BottleneckAnalyzer();
    setupBottleneckTracking(page, analyzer);

    analyzer.startPageLoad();
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);
    analyzer.chartsRendered();

    const analysis = analyzer.analyze();

    // Sort by response size
    const bySize = [...analysis.allEndpoints]
      .filter((e) => e.responseSize)
      .sort((a, b) => b.responseSize - a.responseSize);

    console.log('\n' + '='.repeat(70));
    console.log('PAYLOAD SIZE ANALYSIS');
    console.log('='.repeat(70));

    console.log('\n📦 LARGEST PAYLOADS:');
    console.table(
      bySize.slice(0, 10).map((e) => ({
        Endpoint: e.endpoint,
        Size: `${Math.round(e.responseSize / 1024)}KB`,
        'Total Time': `${e.total}ms`,
        'Backend Time': `${e.backend}ms`,
        'Size/Time Ratio': `${Math.round(e.responseSize / e.total)} bytes/ms`,
      }))
    );

    // Total payload
    const totalBytes = bySize.reduce((a, b) => a + b.responseSize, 0);
    console.log(`\n📊 TOTAL PAYLOAD: ${Math.round(totalBytes / 1024)}KB`);

    if (totalBytes > 500 * 1024) {
      console.log('   ⚠️ Large total payload - consider pagination or lazy loading');
    }
  });
});
