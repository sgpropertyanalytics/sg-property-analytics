-- Migration: 018_add_comparison_summary_columns
-- Purpose: Add queryable summary columns for comparison metrics
--
-- These columns duplicate data from comparison_results JSONB but allow:
--   - Easy querying: SELECT * FROM ura_sync_runs WHERE is_acceptable = false
--   - Indexing: CREATE INDEX ... ON ura_sync_runs(is_acceptable)
--   - Analytics: AVG(count_diff_pct) over last 30 runs
--
-- The JSONB still contains full detail; these are convenience fields.

-- ============================================================================
-- 1. Add comparison summary columns to ura_sync_runs
-- ============================================================================

-- Row count difference percentage (API vs baseline)
ALTER TABLE ura_sync_runs
ADD COLUMN IF NOT EXISTS count_diff_pct NUMERIC(6,2);

-- PSF median difference percentage (largest diff across months)
ALTER TABLE ura_sync_runs
ADD COLUMN IF NOT EXISTS psf_median_diff_pct NUMERIC(6,2);

-- Coverage percentage (matched rows / total rows)
ALTER TABLE ura_sync_runs
ADD COLUMN IF NOT EXISTS coverage_pct NUMERIC(6,2);

-- Overall pass/fail based on thresholds
ALTER TABLE ura_sync_runs
ADD COLUMN IF NOT EXISTS is_acceptable BOOLEAN;

-- Baseline row count for reference
ALTER TABLE ura_sync_runs
ADD COLUMN IF NOT EXISTS baseline_row_count INTEGER;

-- Current (API) row count for reference
ALTER TABLE ura_sync_runs
ADD COLUMN IF NOT EXISTS current_row_count INTEGER;


-- ============================================================================
-- 2. Add index for querying failed runs
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ura_sync_runs_acceptable
ON ura_sync_runs(is_acceptable)
WHERE is_acceptable IS NOT NULL;


-- ============================================================================
-- 3. Helpful queries
-- ============================================================================

-- View recent runs with comparison summary:
-- SELECT
--     id,
--     started_at,
--     status,
--     count_diff_pct,
--     coverage_pct,
--     is_acceptable,
--     current_row_count,
--     baseline_row_count
-- FROM ura_sync_runs
-- ORDER BY started_at DESC
-- LIMIT 30;

-- Find failed comparisons:
-- SELECT * FROM ura_sync_runs
-- WHERE is_acceptable = false
-- ORDER BY started_at DESC;

-- Average metrics over last 30 days:
-- SELECT
--     AVG(count_diff_pct) as avg_count_diff,
--     AVG(coverage_pct) as avg_coverage,
--     COUNT(*) FILTER (WHERE is_acceptable) as passed,
--     COUNT(*) FILTER (WHERE NOT is_acceptable) as failed
-- FROM ura_sync_runs
-- WHERE started_at > NOW() - INTERVAL '30 days'
--   AND status = 'succeeded';
