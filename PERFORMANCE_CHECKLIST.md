# Performance Checklist for Singapore Property Analytics Dashboard

This checklist ensures the dashboard maintains high performance as data scales from 100K to 1M+ transactions.

## Target Performance Goals

| Metric | Target | Acceptable |
|--------|--------|------------|
| Common query response (cached) | < 50ms | < 100ms |
| Common query response (uncached) | < 300ms | < 500ms |
| Worst case query | < 1s | < 2s |
| Cache hit rate | > 80% | > 60% |
| Memory usage (Render) | < 400MB | < 512MB |

---

## Pre-Launch Checklist

### Database Performance

- [ ] **Run performance indexes migration**
  ```bash
  psql $DATABASE_URL -f backend/migrations/add_performance_indexes.sql
  ```

- [ ] **Verify indexes exist**
  ```sql
  SELECT indexname, indexdef FROM pg_indexes
  WHERE tablename = 'transactions';
  ```

  Expected indexes:
  - `idx_txn_date_district_bedroom`
  - `idx_txn_district_bedroom_date`
  - `idx_txn_agg_covering`
  - `idx_txn_psf`
  - `idx_txn_price`
  - `idx_txn_sale_type`

- [ ] **Run ANALYZE to update statistics**
  ```sql
  ANALYZE transactions;
  ```

- [ ] **Test query performance with EXPLAIN ANALYZE**
  ```sql
  EXPLAIN (ANALYZE, BUFFERS)
  SELECT district, COUNT(*), AVG(psf)
  FROM transactions
  WHERE transaction_date >= '2024-01-01'
    AND bedroom_count IN (2, 3, 4)
  GROUP BY district;
  ```
  - Should show Index Scan, not Seq Scan
  - Execution time should be < 50ms

### API Configuration

- [ ] **Verify server-side caching is enabled**
  ```bash
  curl https://your-api.onrender.com/api/dashboard/cache
  ```
  Should return: `{"size": 0, "maxsize": 500, "ttl": 300}`

- [ ] **Test dashboard endpoint**
  ```bash
  time curl "https://your-api.onrender.com/api/dashboard?bedroom=2,3,4"
  ```
  First call: < 500ms
  Second call: < 100ms (cache hit)

- [ ] **Verify query timeout is configured** (in `dashboard_service.py`)
  - `QUERY_TIMEOUT_SECONDS = 10`

- [ ] **Verify request validation limits**
  - `MAX_DATE_RANGE_DAYS = 3650` (10 years)
  - `MAX_HISTOGRAM_BINS = 50`
  - `MAX_LOCATION_RESULTS = 50`

### Memory Safety

- [ ] **Verify GLOBAL_DF is NOT loaded in production**
  Check `backend/app.py` does not call `set_global_dataframe()` unless explicitly needed.

- [ ] **Use SQL aggregation everywhere**
  All dashboard queries should use SQLAlchemy, not pandas.

---

## Per-Release Checklist

### Before Deployment

- [ ] **Run EXPLAIN ANALYZE on new/modified queries**
  ```sql
  EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
  <your_new_query>;
  ```
  Check for:
  - Seq Scans on large tables (bad)
  - Index Scans (good)
  - Execution time < 200ms

- [ ] **Test with production data volume**
  If possible, test against a staging environment with production-sized data.

- [ ] **Review slow query logs**
  Check for queries > 1000ms in application logs.

### After Deployment

- [ ] **Verify cache is warming**
  ```bash
  curl https://your-api.onrender.com/api/dashboard/cache
  ```
  `size` should increase with usage.

- [ ] **Check response times**
  ```bash
  for i in {1..5}; do
    time curl -s "https://your-api.onrender.com/api/dashboard" > /dev/null
  done
  ```

- [ ] **Monitor Render dashboard**
  - Memory usage < 400MB
  - No OOM restarts

---

## Weekly Checklist (with Data Uploads)

### After Weekly CSV Upload

- [ ] **Refresh materialized views (if using)**
  ```sql
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_aggregates;
  ```

- [ ] **Update precomputed_stats table**
  ```python
  from services.aggregation_service import recompute_all_stats
  recompute_all_stats()
  ```

- [ ] **Invalidate dashboard cache**
  ```bash
  curl -X DELETE https://your-api.onrender.com/api/dashboard/cache
  ```
  Or programmatically:
  ```python
  from services.dashboard_service import clear_dashboard_cache
  clear_dashboard_cache()
  ```

- [ ] **Verify new data is queryable**
  ```bash
  curl "https://your-api.onrender.com/api/dashboard?panels=summary"
  ```
  Check `date_max` includes latest upload date.

- [ ] **Check index bloat (if > 500K rows)**
  ```sql
  SELECT
    schemaname, tablename, indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
  FROM pg_stat_user_indexes
  WHERE tablename = 'transactions'
  ORDER BY pg_relation_size(indexrelid) DESC;
  ```

---

## Monthly Checklist

### Performance Review

- [ ] **Review slow query patterns**
  Look for queries > 500ms in logs:
  ```bash
  grep "SLOW" application.log | head -20
  ```

- [ ] **Analyze cache miss patterns**
  Identify frequently-missed cache keys and consider pre-warming.

- [ ] **Consider new indexes for frequent queries**
  If a common query pattern shows Seq Scan, add a targeted index.

- [ ] **Review Render resource usage**
  - Average memory usage
  - Peak memory usage
  - CPU utilization

### Data Maintenance

- [ ] **Check for index bloat**
  If indexes are > 2x table size, consider:
  ```sql
  REINDEX INDEX CONCURRENTLY idx_name;
  ```

- [ ] **Consider partitioning (if > 1M rows)**
  See architecture plan section A for partitioning strategy.

- [ ] **Archive old data (if > 5 years)**
  Consider moving transactions older than 5 years to archive table.

---

## Troubleshooting

### Slow Dashboard Response

1. **Check if cache hit**
   Response includes `"cache_hit": true/false`

2. **Check specific panel timing**
   Look at logs for individual panel query times:
   ```
   time_series_query completed in 45.2ms
   volume_by_location_query completed in 32.1ms
   ```

3. **Run EXPLAIN ANALYZE**
   ```sql
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT ... <copy query from panel function>
   ```

4. **Check for missing indexes**
   If you see Seq Scan, add appropriate index.

### Memory Issues

1. **Check if GLOBAL_DF is loaded**
   ```python
   from services.data_processor import GLOBAL_DF
   print(f"GLOBAL_DF: {GLOBAL_DF is not None}")
   ```

2. **Check cache size**
   ```bash
   curl https://your-api.onrender.com/api/dashboard/cache
   ```
   If `size` is near `maxsize`, consider reducing TTL.

3. **Profile memory with tracemalloc**
   ```python
   import tracemalloc
   tracemalloc.start()
   # ... run query ...
   snapshot = tracemalloc.take_snapshot()
   top_stats = snapshot.statistics('lineno')
   for stat in top_stats[:10]:
       print(stat)
   ```

### Cache Not Working

1. **Verify filter normalization**
   Same filters should produce same cache key:
   ```python
   from services.dashboard_service import build_cache_key
   key1 = build_cache_key({'districts': ['D09', 'D10']}, ['summary'], {})
   key2 = build_cache_key({'districts': ['D10', 'D09']}, ['summary'], {})
   assert key1 == key2  # Should be equal (sorted)
   ```

2. **Check TTL configuration**
   `CACHE_TTL_SECONDS = 300` in `dashboard_service.py`

3. **Check cache stampede prevention**
   If multiple requests for same key, only one should compute.

---

## Quick Reference

### API Endpoints

| Endpoint | Purpose | Response Time |
|----------|---------|---------------|
| `GET /api/dashboard` | All chart data (unified) | < 300ms |
| `GET /api/dashboard/cache` | Cache stats | < 10ms |
| `DELETE /api/dashboard/cache` | Clear cache | < 10ms |
| `GET /api/aggregate` | Flexible aggregation | < 300ms |
| `GET /api/transactions/list` | Paginated raw data | < 200ms |

### Cache Key Format

```
dashboard:{hash}
```

Where `hash` is MD5 of normalized filter JSON.

### Dashboard Panels

| Panel | Description |
|-------|-------------|
| `time_series` | Transaction count + median PSF over time |
| `volume_by_location` | Count by region/district/project |
| `price_histogram` | Price distribution (20 bins) |
| `bedroom_mix` | Bedroom type distribution over time |
| `sale_type_breakdown` | New Sale vs Resale over time |
| `summary` | KPIs (total count, median PSF, etc.) |

### Useful SQL Queries

**Check query plan:**
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) <query>;
```

**Check index usage:**
```sql
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public';
```

**Check table size:**
```sql
SELECT pg_size_pretty(pg_total_relation_size('transactions'));
```

**Check cache hit ratio:**
```sql
SELECT
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;
```
