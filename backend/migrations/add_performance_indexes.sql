-- Performance Indexes for High-Performance Analytics Dashboard
-- Run this migration after the application is deployed
--
-- Usage:
--   psql $DATABASE_URL -f migrations/add_performance_indexes.sql
--
-- Note: Originally used CONCURRENTLY but removed for Supabase/PgBouncer compatibility.
-- Regular CREATE INDEX is safe during deploys (no traffic routed yet).

-- ============================================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- ============================================================================

-- Most common filter pattern: date range + district + bedroom
-- This covers TimeTrendChart, BedroomMixChart queries
CREATE INDEX IF NOT EXISTS idx_txn_date_district_bedroom
  ON transactions(transaction_date, district, bedroom_count);

-- Alternative order for district-first queries (VolumeByLocationChart)
CREATE INDEX IF NOT EXISTS idx_txn_district_bedroom_date
  ON transactions(district, bedroom_count, transaction_date);

-- Covering index for aggregation queries (includes frequently selected columns)
-- This allows index-only scans for most dashboard queries
CREATE INDEX IF NOT EXISTS idx_txn_agg_covering
  ON transactions(transaction_date, district, bedroom_count, sale_type)
  INCLUDE (price, psf, area_sqft);

-- ============================================================================
-- SINGLE-COLUMN INDEXES FOR RANGE QUERIES
-- ============================================================================

-- PSF range queries (for histogram and filters)
CREATE INDEX IF NOT EXISTS idx_txn_psf
  ON transactions(psf);

-- Price range queries (for histogram)
CREATE INDEX IF NOT EXISTS idx_txn_price
  ON transactions(price);

-- Sale type filter (New Sale vs Resale)
CREATE INDEX IF NOT EXISTS idx_txn_sale_type
  ON transactions(sale_type);

-- Area sqft for size range queries
CREATE INDEX IF NOT EXISTS idx_txn_area_sqft
  ON transactions(area_sqft);

-- Remaining lease for tenure queries
CREATE INDEX IF NOT EXISTS idx_txn_remaining_lease
  ON transactions(remaining_lease);

-- ============================================================================
-- PARTIAL INDEX FOR RECENT DATA (OPTIONAL - FOR LARGE DATASETS)
-- ============================================================================

-- Most queries focus on recent data (last 2-3 years)
-- This partial index is much smaller and faster for recent date queries
-- Uncomment when you have > 500K rows

-- CREATE INDEX IF NOT EXISTS idx_txn_recent
--   ON transactions(transaction_date, district, bedroom_count)
--   WHERE transaction_date >= CURRENT_DATE - INTERVAL '2 years';

-- ============================================================================
-- ANALYZE TABLES TO UPDATE STATISTICS
-- ============================================================================

ANALYZE transactions;

-- ============================================================================
-- VERIFY INDEXES
-- ============================================================================

-- List all indexes on transactions table
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'transactions'
ORDER BY indexname;
