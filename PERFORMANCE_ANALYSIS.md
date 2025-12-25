# Dashboard Performance Analysis & Optimization Plan

## Executive Summary

**Current State:** Dashboard loads in 5-15s, filter changes are slow.
**Target State:** <2s first paint, <500ms filter changes.
**Scalability Goal:** 100 concurrent users without degradation.

---

## 1. Endpoint Inventory

### 1.1 First Load Endpoints (MacroOverview Page)

| Endpoint | Called By | Estimated Query Cost | Worst-Case Rows |
|----------|-----------|---------------------|-----------------|
| `GET /api/health` | DataContext | Low (simple count) | 1 row |
| `GET /api/filter-options` | PowerBIFilterContext | Medium (distinct queries) | ~28 districts + ranges |
| `GET /api/kpi-summary` | MacroOverview KPI cards | Medium (4 CTEs) | Aggregates only |
| `GET /api/aggregate?group_by=month,sale_type` | TimeTrendChart | **HIGH** (full scan) | ~120 months × 2 sale_types |
| `GET /api/aggregate?group_by=month,region` | MedianPsfTrendChart | **HIGH** (full scan + CASE) | ~120 months × 3 regions |
| `GET /api/dashboard?panels=price_histogram` | PriceDistributionChart | **HIGH** (percentile calc) | Histogram bins |
| `GET /api/aggregate?group_by=district` | UnitSizeVsPriceChart | Medium | ~28 districts |
| `GET /api/new-vs-resale` | NewVsResaleChart | **HIGH** (dual aggregation) | ~120 periods |
| `GET /api/aggregate?group_by=project` | PriceCompressionChart | **VERY HIGH** | ~5000+ projects |
| `GET /api/gls/all` | GLSDataTable | Low (small table) | ~100 rows |
| `GET /api/upcoming-launches/all` | UpcomingLaunchesTable | Low (small table) | ~50 rows |
| `GET /api/transactions/list` | TransactionDataTable (premium) | **VERY HIGH** | 50-200 per page |

**Total First Load API Calls:** 10-12 endpoints

### 1.2 Filter Change Endpoints

When any sidebar filter changes, **ALL chart components re-fetch**:

| Component | Endpoint Pattern | Re-fetches On |
|-----------|------------------|---------------|
| TimeTrendChart | `/aggregate?group_by={timeGrouping},sale_type` | All filters + time grain |
| MedianPsfTrendChart | `/aggregate?group_by={timeGrouping},region` | All filters + time grain |
| UnitSizeVsPriceChart | `/aggregate?group_by=district` | All filters |
| PriceDistributionChart | `/dashboard?panels=price_histogram` | All filters |
| NewVsResaleChart | `/new-vs-resale` | All filters + time grain |
| PriceCompressionChart | `/aggregate?group_by=project` | All filters |
| TransactionDataTable | `/transactions/list` | All filters + pagination |
| KPI Cards | `/kpi-summary` | District, bedroom, segment only |

**Problem:** 8 parallel API calls on every filter change = request fan-out storm.

---

## 2. Query Pattern Analysis

### 2.1 Identified Anti-Patterns

#### A. N+1 Query for Segment Filtering
```python
# analytics.py:1360-1366 - Runs on EVERY aggregate request with segment filter
all_districts = db.session.query(Transaction.district).distinct().all()
segment_districts = [
    d[0] for d in all_districts
    if _get_market_segment(d[0]) in segments  # Python loop, not SQL
]
```
**Fix:** Pre-compute district→segment mapping, or use SQL CASE.

#### B. Repeated Outlier Filter
Every query includes:
```python
filter_conditions.append(or_(
    Transaction.is_outlier == False,
    Transaction.is_outlier.is_(None)
))
```
**Current State:** Partial indexes exist for this pattern (migration 003).

#### C. Heavy Percentile Calculations
```python
# price_histogram - Two PERCENTILE_CONT queries
PERCENTILE_CONT(0.05/0.25/0.50/0.75/0.95) WITHIN GROUP (ORDER BY price)
```
**Cost:** PostgreSQL must sort ALL matching rows for each percentile.

#### D. Project-Level Aggregation Fan-Out
`PriceCompressionChart` groups by project - can return 5000+ projects.
```python
query = query.group_by(Transaction.project_name)  # No LIMIT!
```

#### E. Frontend Re-fetch on Every Filter Change
```javascript
// PowerBIFilterContext.jsx - activeFilters memo triggers all charts
const activeFilters = useMemo(() => { ... }, [filters, crossFilter, highlight, ...]);
```
All charts have `useEffect` watching `activeFilters` → 8 parallel API calls.

### 2.2 Missing Indexes

Current indexes (from migrations):
```sql
-- Single column
idx_transactions_project_name, idx_transactions_transaction_date
idx_transactions_district, idx_transactions_bedroom_count
idx_transactions_is_outlier, idx_transactions_floor_level

-- Composite (add_performance_indexes.sql)
idx_txn_date_district_bedroom
idx_txn_district_bedroom_date
idx_txn_agg_covering (INCLUDE price, psf, area_sqft)

-- Partial (003_add_partial_indexes.sql)
idx_txn_active_composite (WHERE is_outlier = false OR is_outlier IS NULL)
idx_txn_price_active
idx_txn_psf_active
```

**Still Missing:**
```sql
-- For sale_type filtering (frequent)
idx_txn_sale_type_date (sale_type, transaction_date) WHERE is_outlier = false

-- For region/segment grouping (CASE statement can't use index)
idx_txn_district_date_saletype (district, transaction_date, sale_type) WHERE is_outlier = false

-- For tenure filtering
idx_txn_remaining_lease (remaining_lease) WHERE is_outlier = false
```

---

## 3. Bottleneck Ranking (Impact × Frequency)

| Rank | Issue | Impact | Frequency | Fix Difficulty |
|------|-------|--------|-----------|----------------|
| 1 | Frontend request fan-out (8 calls per filter) | HIGH | Every filter change | Medium |
| 2 | `/aggregate?group_by=project` no LIMIT | HIGH | Every filter change | Low |
| 3 | Percentile calculations on large datasets | MEDIUM | Every histogram load | Medium |
| 4 | N+1 segment→district lookup | LOW | Every segment filter | Low |
| 5 | No query result caching for aggregate | MEDIUM | Cache exists but 5min TTL | Low |
| 6 | Missing sale_type composite index | LOW | Sale type filters | Low |

---

## 4. Minimal Fixes (Low Risk)

### 4.1 Add Missing Indexes

```sql
-- migrations/007_add_performance_indexes_v2.sql

-- Sale type + date composite for New vs Resale chart
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_saletype_date_active
  ON transactions(sale_type, transaction_date)
  INCLUDE (price, psf, district, bedroom_count)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- District + sale_type + date for segment/region queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_district_saletype_date_active
  ON transactions(district, sale_type, transaction_date)
  INCLUDE (price, psf)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- Tenure filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_tenure_active
  ON transactions(remaining_lease)
  INCLUDE (price, psf, district)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- Update statistics
ANALYZE transactions;
```

### 4.2 Enable Response Compression (Gzip)

Large project aggregations (5000+ rows) should be compressed at the HTTP level:

```python
# backend/app.py - Enable Flask-Compress
from flask_compress import Compress

app = Flask(__name__)
Compress(app)  # Automatically gzip responses > 500 bytes

# Or via Render/nginx configuration:
# Content-Encoding: gzip automatically applied
```

**Note:** Do NOT use LIMIT on project aggregations - users need complete data.
For large datasets, rely on:
- Response compression (gzip reduces 5MB → ~500KB)
- Frontend virtualization for rendering
- Optional `?limit=N` parameter if frontend explicitly requests it

### 4.3 Pre-compute Segment Districts

```python
# backend/constants.py - already has this, ensure it's used
CCR_DISTRICTS = ['D01', 'D02', 'D06', 'D09', 'D10', 'D11']
RCR_DISTRICTS = ['D03', 'D04', 'D05', 'D07', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20']
OCR_DISTRICTS = ['D16', 'D17', 'D18', 'D19', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28']

# backend/routes/analytics.py - Replace N+1 lookup with direct mapping
# BEFORE (slow):
all_districts = db.session.query(Transaction.district).distinct().all()
segment_districts = [d[0] for d in all_districts if _get_market_segment(d[0]) in segments]

# AFTER (fast):
from constants import get_districts_for_region
segment_districts = []
for seg in segments:
    segment_districts.extend(get_districts_for_region(seg))
```

### 4.4 Optimize Histogram Binning

```python
# backend/services/dashboard_service.py - Replace percentile with approximate

# BEFORE: Exact percentiles (expensive)
PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY price) as p5

# AFTER: Use materialized percentiles from pre-computed stats
# Only recalculate on data upload, not per-request
```

### 4.5 Extend Cache TTL for Stable Data

```python
# backend/services/dashboard_service.py - line 56
CACHE_TTL_SECONDS = 600  # 10 minutes (was 5)
CACHE_MAX_SIZE = 1000    # Double cache size (was 500)
```

---

## 5. Caching Plan

### 5.1 Current State

| Layer | Implementation | TTL | Scope |
|-------|---------------|-----|-------|
| Backend | `TTLCache` in dashboard_service.py | 5 min | Per-endpoint cache key |
| Frontend | `apiCache` Map in client.js | 5 min | Per-URL cache key |
| Database | PostgreSQL query cache | OS-level | Shared buffers |

### 5.2 Recommended Caching Strategy

#### A. Static Data (Cache Forever Until Upload)

| Data Type | Current TTL | Recommended TTL | Invalidation |
|-----------|-------------|-----------------|--------------|
| Filter options (districts, bedrooms) | 5 min | 24 hours | On data upload |
| GLS tenders | 5 min | 1 hour | On upload |
| Upcoming launches | 5 min | 1 hour | On upload |
| School data | 5 min | 24 hours | On upload |

```python
# Add to dashboard_service.py
STATIC_DATA_TTL = 86400  # 24 hours
REFERENCE_DATA_TTL = 3600  # 1 hour

# Separate cache for static data
_static_cache = TTLCache(maxsize=100, ttl=STATIC_DATA_TTL)
```

#### B. Aggregate Data (Filter-Dependent)

| Query Pattern | Recommended TTL | Cache Key Pattern |
|---------------|-----------------|-------------------|
| No filters (all data) | 30 min | `agg:all:{panels}:{grain}` |
| Segment only (CCR/RCR/OCR) | 15 min | `agg:seg:{segment}:{panels}` |
| Date range only | 10 min | `agg:date:{from}:{to}:{panels}` |
| Complex filters | 5 min | `agg:{hash(filters)}` |

```python
# Tiered TTL based on filter complexity
def get_cache_ttl(filters):
    if not filters or all(v is None for v in filters.values()):
        return 1800  # 30 min for unfiltered
    if len([k for k,v in filters.items() if v]) == 1:
        return 900   # 15 min for single filter
    return 300       # 5 min for complex filters
```

#### C. Pre-Warm Common Queries

```python
# backend/services/dashboard_service.py - Expand warm_cache_for_common_queries()
def warm_cache_for_common_queries():
    """Pre-warm cache on app startup and periodically."""
    common_queries = [
        # Unfiltered (most common landing)
        {'filters': {}, 'panels': ['time_series', 'volume_by_location', 'price_histogram', 'summary']},
        # By segment (3 variants)
        *[{'filters': {'segment': seg}, 'panels': [...]} for seg in ['CCR', 'RCR', 'OCR']],
        # By bedroom (common: 2,3,4 BR)
        *[{'filters': {'bedrooms': [br]}, 'panels': [...]} for br in [2, 3, 4]],
        # Last 12 months (common date filter)
        {'filters': {'date_from': '2024-01-01'}, 'panels': [...]},
    ]
    # Execute in background thread
    for q in common_queries:
        get_dashboard_data(q['filters'], q['panels'], skip_cache=True)
```

#### D. Cache Invalidation

```python
# backend/routes/analytics.py - Add to data upload handler
@analytics_bp.route("/admin/upload", methods=["POST"])
def upload_data():
    # ... upload logic ...

    # Invalidate all caches after data upload
    from services.dashboard_service import clear_dashboard_cache
    clear_dashboard_cache()

    # Also clear static cache
    _static_cache.clear()

    # Re-warm common queries in background
    from threading import Thread
    Thread(target=warm_cache_for_common_queries, daemon=True).start()
```

### 5.3 Frontend Debouncing

```javascript
// frontend/src/context/PowerBIFilterContext.jsx
// Add debounce to filter changes to prevent request storm

import { useMemo, useCallback, useRef, useEffect } from 'react';
import debounce from 'lodash/debounce';

// Debounced filter change handler
const debouncedSetFilters = useMemo(
  () => debounce((newFilters) => {
    setFilters(newFilters);
  }, 300),  // 300ms debounce
  []
);
```

---

## 6. Connection Pool Optimization

### Current Config (config.py)
```python
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_size': 5,
    'max_overflow': 10,
    'pool_recycle': 300,
    'pool_pre_ping': True,
}
```

### Recommended for 100 Users
```python
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_size': 10,        # Base connections (was 5)
    'max_overflow': 20,     # Burst capacity (was 10)
    'pool_recycle': 300,    # Keep at 5 min
    'pool_pre_ping': True,  # Keep connection validation
    'pool_timeout': 20,     # Wait max 20s for connection
    'echo_pool': 'debug',   # Enable for debugging
}
```

**Note:** Render free tier may have connection limits. Check plan constraints.

---

## 7. Load Test Plan

### 7.1 k6 Test Script

```javascript
// load_test.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';

// Custom metrics
const dashboardLatency = new Trend('dashboard_latency');
const aggregateLatency = new Trend('aggregate_latency');
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
    'errors': ['rate<0.05'],            // Error rate under 5%
    'http_req_duration': ['p99<5000'],  // 99% under 5s
  },
};

// Simulate page load
export default function() {
  group('Dashboard First Load', () => {
    // Health check
    let res = http.get(`${BASE_URL}/health`);
    check(res, { 'health ok': (r) => r.status === 200 });

    // Filter options (cached)
    res = http.get(`${BASE_URL}/filter-options`);
    check(res, { 'filter-options ok': (r) => r.status === 200 });

    // KPI Summary
    res = http.get(`${BASE_URL}/kpi-summary`);
    check(res, { 'kpi-summary ok': (r) => r.status === 200 });
    dashboardLatency.add(res.timings.duration);

    // Dashboard endpoint
    res = http.get(`${BASE_URL}/dashboard?panels=time_series,price_histogram,summary`);
    check(res, { 'dashboard ok': (r) => r.status === 200 });
    dashboardLatency.add(res.timings.duration);
    if (res.status !== 200) errorRate.add(1);
  });

  sleep(1);

  group('Filter Change Simulation', () => {
    // Segment filter
    let res = http.get(`${BASE_URL}/aggregate?group_by=month,sale_type&segment=CCR`);
    aggregateLatency.add(res.timings.duration);
    check(res, { 'aggregate CCR ok': (r) => r.status === 200 });

    // District filter
    res = http.get(`${BASE_URL}/aggregate?group_by=month&district=D09,D10`);
    aggregateLatency.add(res.timings.duration);
    check(res, { 'aggregate district ok': (r) => r.status === 200 });

    // Bedroom filter
    res = http.get(`${BASE_URL}/aggregate?group_by=quarter&bedroom=3`);
    aggregateLatency.add(res.timings.duration);
    check(res, { 'aggregate bedroom ok': (r) => r.status === 200 });
  });

  sleep(2);
}
```

### 7.2 Running the Test

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt install k6  # Ubuntu

# Run against local backend
k6 run --env BASE_URL=http://localhost:5000/api load_test.js

# Run against production (be careful!)
k6 run --env BASE_URL=https://your-app.onrender.com/api load_test.js

# With summary output
k6 run --out json=results.json load_test.js
```

### 7.3 Metrics to Watch

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| p50 latency (dashboard) | <500ms | 1000ms |
| p95 latency (dashboard) | <2000ms | 5000ms |
| p99 latency (dashboard) | <5000ms | 10000ms |
| Error rate | <1% | 5% |
| DB CPU | <70% | 90% |
| DB connections | <15 active | 25 (pool max) |
| Memory (backend) | <400MB | 512MB (Render limit) |

### 7.4 Database Monitoring Queries

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Slow queries (> 1 second)
SELECT
    query,
    calls,
    mean_exec_time,
    total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY total_exec_time DESC
LIMIT 10;

-- Missing indexes (sequential scans on large tables)
SELECT
    schemaname,
    relname,
    seq_scan,
    seq_tup_read,
    idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 10;
```

---

## 8. Implementation Priority

### Phase 1: Quick Wins (1-2 hours)
1. ✅ Add missing indexes (007_add_performance_indexes_v2.sql)
2. ✅ Add LIMIT to project aggregation
3. ✅ Extend cache TTL to 10 min
4. ✅ Pre-compute segment districts (remove N+1)

### Phase 2: Frontend Optimization (2-4 hours)
1. Add 300ms debounce to filter changes
2. Coalesce multiple chart API calls into batched `/dashboard` call
3. Add skeleton loading states (perceived performance)

### Phase 3: Advanced Caching (4-8 hours)
1. Tiered TTL based on filter complexity
2. Background cache warming on startup
3. Cache invalidation on data upload

### Phase 4: Monitoring (2-4 hours)
1. Set up k6 load test in CI
2. Add query timing logs with thresholds
3. Alert on p95 > 2s

---

## 9. Risk Assessment

| Fix | Risk Level | Rollback Plan |
|-----|------------|---------------|
| Add indexes | LOW | DROP INDEX if needed |
| Increase cache TTL | LOW | Reduce TTL |
| Enable gzip compression | LOW | Disable compression |
| Frontend debounce | LOW | Remove debounce |
| Increase pool size | MEDIUM | May hit Render connection limits |

---

## 10. Summary

**Root Causes of 5-15s Load Time:**
1. Frontend fires 8+ parallel API calls on every filter change
2. Heavy percentile calculations without materialization
3. Large uncompressed JSON responses (5000+ projects)
4. 5-minute cache TTL too short for stable data
5. N+1 query pattern for segment filtering

**Recommended Immediate Actions:**
1. Add missing composite indexes ✅ (migration 007)
2. Replace N+1 segment lookup with constants ✅ (implemented)
3. Extend cache TTL to 10 min for aggregate data ✅ (implemented)
4. Enable gzip response compression
5. Add 300ms debounce to frontend filter changes

**NOT Recommended:**
- Do NOT add LIMIT to project aggregations - users need complete data

**Expected Improvement:**
- First load: 5-15s → 2-3s
- Filter changes: 2-5s → 500ms-1s
- Concurrent user capacity: 10 → 100+
