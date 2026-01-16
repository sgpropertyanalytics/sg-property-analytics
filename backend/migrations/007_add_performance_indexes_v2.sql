-- Migration 007: Additional Performance Indexes for Dashboard Optimization
--
-- Purpose: Address slow dashboard queries identified in performance analysis
--
-- Run with: psql "$DATABASE_URL" -f backend/migrations/007_add_performance_indexes_v2.sql
--
-- Note: Originally used CONCURRENTLY but removed for Supabase/PgBouncer compatibility.
-- Regular CREATE INDEX is safe during deploys (no traffic routed yet).
--
-- Expected improvement: 30-50% reduction in query time for filtered aggregations

-- ============================================================================
-- SALE TYPE + DATE COMPOSITE (for New vs Resale chart)
-- Covers: NewVsResaleChart, sale_type filtering in aggregate endpoint
-- ============================================================================
-- NOTE: This index was originally created in 003_add_partial_indexes.sql without
-- the INCLUDE clause. We drop it here to recreate with INCLUDE for better
-- covering query performance.

DROP INDEX IF EXISTS idx_txn_saletype_date_active;
CREATE INDEX IF NOT EXISTS idx_txn_saletype_date_active
  ON transactions(sale_type, transaction_date)
  INCLUDE (price, psf, district, bedroom_count)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- ============================================================================
-- DISTRICT + SALE TYPE + DATE (for segment/region grouping)
-- Covers: Region-based aggregations with sale type breakdown
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_txn_district_saletype_date_active
  ON transactions(district, sale_type, transaction_date)
  INCLUDE (price, psf)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- ============================================================================
-- TENURE FILTERING (remaining_lease queries)
-- Covers: Freehold vs 99-year filtering in sidebar
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_txn_tenure_active
  ON transactions(remaining_lease)
  INCLUDE (price, psf, district, bedroom_count)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- ============================================================================
-- LEASE START YEAR (for property age calculations)
-- Covers: Property age filtering in sidebar
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_txn_lease_year_active
  ON transactions(lease_start_year, transaction_date)
  WHERE is_outlier = false OR is_outlier IS NULL
    AND lease_start_year IS NOT NULL;

-- ============================================================================
-- PROJECT NAME + BEDROOM (for project-level drill-through)
-- Covers: ProjectDetailPanel queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_txn_project_bedroom_active
  ON transactions(project_name, bedroom_count)
  INCLUDE (price, psf, transaction_date, sale_type)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- ============================================================================
-- UPDATE STATISTICS
-- ============================================================================

ANALYZE transactions;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes
WHERE tablename = 'transactions'
  AND indexname LIKE 'idx_txn_%_active'
ORDER BY indexname;

-- Show total index size
SELECT
  pg_size_pretty(sum(pg_relation_size(indexname::regclass))) as total_index_size
FROM pg_indexes
WHERE tablename = 'transactions';
