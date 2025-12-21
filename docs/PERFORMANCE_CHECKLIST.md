# Performance Optimization Checklist

Last Updated: 2025-12-21

## Current Performance Status

| Metric | Status | Notes |
|--------|--------|-------|
| Dashboard load (cached) | ✅ <5ms | Cache hit returns instantly |
| Dashboard load (uncached) | ⚠️ ~1.5-2s | Limited by remote DB latency |
| Histogram query | ✅ Optimized | Two-step MIN/MAX approach |
| Partial indexes | ✅ Deployed | 7 indexes for is_outlier filtering |
| Cache warming | ✅ Enabled | Pre-populates on startup |

---

## Completed Optimizations

### 1. Histogram Query Optimization (2025-12-21)

**Problem:** `price_histogram_query` was taking ~1100ms due to window functions.

**Solution:** Replaced single CTE with window functions with two-step approach:
1. Step 1: Fast MIN/MAX query (uses indexes)
2. Step 2: Binning query with pre-calculated bounds

**Files Changed:**
- `backend/services/dashboard_service.py` - `query_price_histogram()`

**Expected Improvement:** ~800ms reduction with proper indexes

---

### 2. Partial Indexes for Outlier Filtering (2025-12-21)

**Problem:** Every query includes `WHERE is_outlier = false OR is_outlier IS NULL` but no index covers this pattern.

**Solution:** Created partial indexes that pre-filter outliers:

```sql
-- Migration: backend/migrations/003_add_partial_indexes.sql

-- Primary composite index (covers most dashboard queries)
idx_txn_active_composite ON transactions(transaction_date, district, bedroom_count, sale_type)
  INCLUDE (price, psf, area_sqft)
  WHERE is_outlier = false OR is_outlier IS NULL

-- Price histogram optimization
idx_txn_price_active ON transactions(price)
  WHERE price > 0 AND (is_outlier = false OR is_outlier IS NULL)

-- PSF queries
idx_txn_psf_active ON transactions(psf)
  WHERE psf > 0 AND (is_outlier = false OR is_outlier IS NULL)

-- District + date queries
idx_txn_district_date_active ON transactions(district, transaction_date)
  WHERE is_outlier = false OR is_outlier IS NULL

-- Bedroom queries
idx_txn_bedroom_date_active ON transactions(bedroom_count, transaction_date)
  WHERE is_outlier = false OR is_outlier IS NULL

-- Sale type breakdown
idx_txn_saletype_date_active ON transactions(sale_type, transaction_date)
  WHERE is_outlier = false OR is_outlier IS NULL

-- Project detail queries
idx_txn_project_date_active ON transactions(project_name, transaction_date)
  WHERE is_outlier = false OR is_outlier IS NULL
```

**Status:** ✅ Deployed to production

---

### 3. Cache Warming on Startup (2025-12-21)

**Problem:** Cold starts on Render (after 15 min idle) caused slow first requests.

**Solution:** Call `warm_cache_for_common_queries()` during app startup.

**Files Changed:**
- `backend/app.py` - Added cache warming in `create_app()`

**Pre-warmed Queries:**
- All data, no filters
- By region (CCR, RCR, OCR)
- By bedroom type (2, 3, 4)

---

### 4. Parallel Query Execution - REVERTED (2025-12-21)

**Problem:** Attempted to parallelize panel queries using ThreadPoolExecutor.

**Finding:** Parallel execution actually made performance **worse** for remote databases:
- Connection pool contention (5 connections max)
- Each thread needs its own DB connection
- Network latency compounded across threads
- Total time: 5964ms parallel vs 1694ms sequential

**Decision:** Reverted to sequential execution. Parallel is only beneficial for local databases with low latency.

---

## Architecture Decisions

### Why Sequential Queries for Remote DB

| Approach | Local DB | Remote DB (Render) |
|----------|----------|-------------------|
| Sequential | ~500ms | ~1500ms |
| Parallel (5 threads) | ~200ms | ~6000ms ❌ |

Remote databases have:
- 100ms+ connection latency per query
- Limited connection pool (5 connections)
- Shared resources across all queries

### Memory Constraints (512MB Render)

All queries use SQL aggregation, never loading full datasets:
- ❌ No pandas DataFrames in memory
- ❌ No client-side histogram computation
- ✅ Server-side GROUP BY for all aggregations
- ✅ Paginated transaction lists

---

## Monitoring

### Slow Query Warnings

Dashboard service logs warnings for queries taking >1000ms:
```
WARNING:dashboard:SLOW OPERATION: price_histogram_query took 1096.0ms
```

### Key Metrics to Watch

| Query | Threshold | Action if Exceeded |
|-------|-----------|-------------------|
| price_histogram | 500ms | Check index usage |
| time_series | 500ms | Check date range indexes |
| volume_by_location | 500ms | Check district indexes |
| get_dashboard_data | 2000ms | Check cache hit rate |

---

## Future Optimizations (Not Yet Implemented)

### Priority 1: Redis Cache
- Current in-memory cache cleared on cold start
- Redis would persist across restarts
- Estimated improvement: Eliminate cold-start lag entirely

### Priority 2: Response Compression
- Add Flask-Compress for gzip
- ~70% reduction in payload size
- Faster network transfer

### Priority 3: Connection Pooling Tuning
- Current: 5 connections, 10 overflow
- May need adjustment based on traffic patterns

---

## How to Verify Performance

### Check Cache Hit Rate
```bash
curl -s "https://sgpropertytrend.onrender.com/api/dashboard?panels=summary" | jq '.meta.cache_hit'
```

### Check Query Timing
```bash
curl -s "https://sgpropertytrend.onrender.com/api/dashboard?panels=price_histogram,summary" | jq '.meta.elapsed_ms'
```

### Verify Indexes Exist
```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'transactions'
AND indexdef LIKE '%is_outlier%';
```

---

## Rollback Procedures

### Revert Histogram Optimization
The old CTE-based query is preserved in git history. To revert:
```bash
git revert <commit-hash>
```

### Drop Partial Indexes (if causing issues)
```sql
DROP INDEX IF EXISTS idx_txn_active_composite;
DROP INDEX IF EXISTS idx_txn_price_active;
DROP INDEX IF EXISTS idx_txn_psf_active;
DROP INDEX IF EXISTS idx_txn_district_date_active;
DROP INDEX IF EXISTS idx_txn_bedroom_date_active;
DROP INDEX IF EXISTS idx_txn_saletype_date_active;
DROP INDEX IF EXISTS idx_txn_project_date_active;
```
