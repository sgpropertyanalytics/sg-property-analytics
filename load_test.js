/**
 * k6 Load Test Script for Dashboard Performance
 *
 * Usage:
 *   k6 run --env BASE_URL=http://localhost:5000/api load_test.js
 *   k6 run --env BASE_URL=https://your-app.onrender.com/api load_test.js
 *
 * Install k6:
 *   brew install k6        # macOS
 *   sudo apt install k6    # Ubuntu
 *   choco install k6       # Windows
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';

// Custom metrics
const dashboardLatency = new Trend('dashboard_latency');
const aggregateLatency = new Trend('aggregate_latency');
const kpiLatency = new Trend('kpi_latency');
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp to 10 users
    { duration: '1m', target: 50 },    // Ramp to 50 users
    { duration: '2m', target: 100 },   // Sustain 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'dashboard_latency': ['p95<2000'],  // 95% under 2s
    'aggregate_latency': ['p95<1000'],  // 95% under 1s
    'kpi_latency': ['p95<500'],         // KPIs should be fast
    'errors': ['rate<0.05'],            // Error rate under 5%
    'http_req_duration': ['p99<5000'],  // 99% under 5s
  },
};

// Common filter combinations users apply
const filterCombos = [
  {},                                     // No filters
  { segment: 'CCR' },                     // CCR only
  { segment: 'RCR' },                     // RCR only
  { segment: 'OCR' },                     // OCR only
  { district: 'D09,D10,D11' },            // Multiple districts
  { bedroom: '3' },                       // 3-bedroom only
  { bedroom: '2,3' },                     // 2 and 3 bedroom
  { segment: 'CCR', bedroom: '3' },       // Combined
  { sale_type: 'New Sale' },              // New sales only
  { sale_type: 'Resale' },                // Resales only
];

function buildQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

// Simulate initial page load
export default function() {
  const filters = filterCombos[Math.floor(Math.random() * filterCombos.length)];
  const qs = buildQueryString(filters);

  group('Dashboard First Load', () => {
    // 1. Health check (fast)
    let res = http.get(`${BASE_URL}/health`);
    check(res, { 'health ok': (r) => r.status === 200 });

    // 2. Filter options (should be cached)
    res = http.get(`${BASE_URL}/filter-options`);
    check(res, { 'filter-options ok': (r) => r.status === 200 });

    // 3. KPI Summary (v2 endpoint)
    res = http.get(`${BASE_URL}/kpi-summary-v2${qs}`);
    kpiLatency.add(res.timings.duration);
    check(res, { 'kpi-summary-v2 ok': (r) => r.status === 200 });
    if (res.status !== 200) errorRate.add(1);

    // 4. Dashboard unified endpoint
    res = http.get(`${BASE_URL}/dashboard${qs}&panels=time_series,price_histogram,summary`);
    dashboardLatency.add(res.timings.duration);
    const dashData = res.json();
    if (dashData && dashData.meta) {
      if (dashData.meta.cache_hit) {
        cacheHits.add(1);
      } else {
        cacheMisses.add(1);
      }
    }
    check(res, { 'dashboard ok': (r) => r.status === 200 });
    if (res.status !== 200) errorRate.add(1);
  });

  sleep(0.5);

  group('Chart Data Fetches', () => {
    // TimeTrendChart - group by month
    let res = http.get(`${BASE_URL}/aggregate${qs}&group_by=month,sale_type&metrics=count,total_value`);
    aggregateLatency.add(res.timings.duration);
    check(res, { 'aggregate month ok': (r) => r.status === 200 });

    // MedianPsfTrendChart - group by month,region
    res = http.get(`${BASE_URL}/aggregate${qs}&group_by=month,region&metrics=count,avg_psf`);
    aggregateLatency.add(res.timings.duration);
    check(res, { 'aggregate region ok': (r) => r.status === 200 });

    // PriceCompressionChart - group by project (returns all projects)
    res = http.get(`${BASE_URL}/aggregate${qs}&group_by=project&metrics=count,avg_psf`);
    aggregateLatency.add(res.timings.duration);
    check(res, { 'aggregate project ok': (r) => r.status === 200 });
  });

  sleep(0.5);

  group('Filter Change Simulation', () => {
    // Simulate user changing filters
    const newFilters = filterCombos[Math.floor(Math.random() * filterCombos.length)];
    const newQs = buildQueryString(newFilters);

    // These would all fire in parallel in the real app
    const requests = {
      'kpi': { method: 'GET', url: `${BASE_URL}/kpi-summary-v2${newQs}` },
      'dashboard': { method: 'GET', url: `${BASE_URL}/dashboard${newQs}&panels=time_series,price_histogram` },
      'aggregate': { method: 'GET', url: `${BASE_URL}/aggregate${newQs}&group_by=month&metrics=count` },
    };

    const responses = http.batch(requests);

    for (const [name, res] of Object.entries(responses)) {
      check(res, { [`${name} batch ok`]: (r) => r.status === 200 });
      if (res.status !== 200) errorRate.add(1);
    }
  });

  sleep(1);
}

// Separate scenario for sustained load testing
export function sustainedLoad() {
  const filters = filterCombos[Math.floor(Math.random() * filterCombos.length)];
  const qs = buildQueryString(filters);

  // Just hit the most expensive endpoint repeatedly
  const res = http.get(`${BASE_URL}/dashboard${qs}&panels=time_series,volume_by_location,price_histogram,summary`);
  dashboardLatency.add(res.timings.duration);
  check(res, { 'sustained dashboard ok': (r) => r.status === 200 });

  sleep(2);
}

// Quick smoke test (use with: k6 run --iterations 1 load_test.js)
export function smokeTest() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'smoke test health ok': (r) => r.status === 200 });

  const res2 = http.get(`${BASE_URL}/dashboard?panels=summary`);
  check(res2, { 'smoke test dashboard ok': (r) => r.status === 200 });
}
