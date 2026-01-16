-- Performance Migration: Partial Indexes for Outlier-Filtered Queries
--
-- PROBLEM: Every analytics query includes `WHERE is_outlier = false OR is_outlier IS NULL`
-- Without partial indexes, Postgres must filter AFTER scanning.
--
-- SOLUTION: Partial indexes that pre-filter outliers, making queries ~3-4x faster.
--
-- Usage:
--   psql $DATABASE_URL -f migrations/003_add_partial_indexes.sql
--
-- Note: Originally used CONCURRENTLY but removed for Supabase/PgBouncer compatibility.
-- Regular CREATE INDEX is safe during deploys (no traffic routed yet).

-- ============================================================================
-- PARTIAL INDEXES FOR NON-OUTLIER QUERIES (MOST COMMON PATTERN)
-- ============================================================================

-- Primary composite index for filtered analytics queries
-- Covers: TimeTrendChart, BedroomMixChart, VolumeByLocationChart, TransactionDataTable
CREATE INDEX IF NOT EXISTS idx_txn_active_composite
  ON transactions(transaction_date, district, bedroom_count, sale_type)
  INCLUDE (price, psf, area_sqft)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- Price histogram optimization (used by PriceDistributionChart)
-- Critical for the optimized two-step histogram query
CREATE INDEX IF NOT EXISTS idx_txn_price_active
  ON transactions(price)
  WHERE price > 0 AND (is_outlier = false OR is_outlier IS NULL);

-- PSF queries with outlier filter
CREATE INDEX IF NOT EXISTS idx_txn_psf_active
  ON transactions(psf)
  WHERE psf > 0 AND (is_outlier = false OR is_outlier IS NULL);

-- District + date for location-based queries
CREATE INDEX IF NOT EXISTS idx_txn_district_date_active
  ON transactions(district, transaction_date)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- Bedroom-specific queries (common filter pattern)
CREATE INDEX IF NOT EXISTS idx_txn_bedroom_date_active
  ON transactions(bedroom_count, transaction_date)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- Sale type breakdown (New Sale vs Resale analysis)
CREATE INDEX IF NOT EXISTS idx_txn_saletype_date_active
  ON transactions(sale_type, transaction_date)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- ============================================================================
-- PROJECT-LEVEL QUERIES (ProjectDetailPanel, drill-through)
-- ============================================================================

-- Project name with date (for project detail queries)
CREATE INDEX IF NOT EXISTS idx_txn_project_date_active
  ON transactions(project_name, transaction_date)
  WHERE is_outlier = false OR is_outlier IS NULL;

-- ============================================================================
-- UPDATE STATISTICS
-- ============================================================================

ANALYZE transactions;

-- ============================================================================
-- VERIFY INDEXES
-- ============================================================================

-- List all partial indexes on transactions table
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'transactions'
  AND indexdef LIKE '%is_outlier%'
ORDER BY indexname;
