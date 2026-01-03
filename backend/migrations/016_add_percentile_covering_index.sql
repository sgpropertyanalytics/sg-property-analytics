-- Migration 016: Covering Index for PERCENTILE_CONT Optimization
--
-- Purpose: Optimize PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) queries
--          which are used 22 times per market-overview page load
--
-- Problem: Current idx_txn_agg_covering has psf in INCLUDE clause, which
--          cannot be used for ORDER BY in window functions. This forces
--          PostgreSQL to sort rows for each PERCENTILE_CONT call.
--
-- Solution: Create index with psf in main columns (not INCLUDE) so
--           PostgreSQL can use index ordering for PERCENTILE_CONT.
--
-- Run with: psql "$DATABASE_URL" -f backend/migrations/016_add_percentile_covering_index.sql
--
-- Expected improvement: 200-300ms reduction in page load time
--                       (from ~1200ms to ~900ms for market-overview)

-- ============================================================================
-- PERCENTILE_CONT OPTIMIZED INDEX (PRIMARY)
-- ============================================================================
-- Covers: KPI queries, compression series, beads chart percentiles
--
-- Column order rationale:
--   1. sale_type: Equality filter (always filtered by Resale/New Sale)
--   2. transaction_date: Range filter (date bounds)
--   3. district: Equality/IN filter (segment filtering)
--   4. bedroom_count: Equality/IN filter (bedroom filtering)
--   5. psf: ORDER BY column for PERCENTILE_CONT (MUST be in main index)
--
-- Partial index: Only non-outlier records (matches WHERE clause in all queries)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_percentile_psf
  ON transactions(sale_type, transaction_date, district, bedroom_count, psf)
  WHERE COALESCE(is_outlier, false) = false;

-- ============================================================================
-- PERCENTILE_CONT FOR REGION-BASED QUERIES
-- ============================================================================
-- Covers: Beads chart (region x bedroom percentiles), compression by region
--
-- Note: We can't index the CASE expression for region, but we can index
-- district which is used to derive region. The query planner will use this
-- index and then compute region from district.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_percentile_region_psf
  ON transactions(sale_type, transaction_date, psf)
  INCLUDE (district, bedroom_count, price, area_sqft)
  WHERE COALESCE(is_outlier, false) = false;

-- ============================================================================
-- KPI MONTHLY AGGREGATION INDEX
-- ============================================================================
-- Covers: Market momentum quarterly medians, time-series percentiles
--
-- Optimized for: GROUP BY date_trunc('month', transaction_date)
-- with PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_monthly_percentile
  ON transactions(sale_type, date_trunc('month', transaction_date), psf)
  WHERE COALESCE(is_outlier, false) = false;

-- ============================================================================
-- UPDATE STATISTICS
-- ============================================================================

ANALYZE transactions;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check new indexes were created
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes
WHERE tablename = 'transactions'
  AND indexname LIKE 'idx_txn_percentile%'
ORDER BY indexname;

-- Show EXPLAIN for a typical PERCENTILE_CONT query
-- Run manually to verify index is being used:
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT
--   PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
-- FROM transactions
-- WHERE COALESCE(is_outlier, false) = false
--   AND sale_type = 'Resale'
--   AND transaction_date >= '2024-01-01'
--   AND transaction_date < '2025-01-01';
--
-- Expected: Index Scan using idx_txn_percentile_psf (not Seq Scan)

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- DROP INDEX CONCURRENTLY IF EXISTS idx_txn_percentile_psf;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_txn_percentile_region_psf;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_txn_monthly_percentile;
