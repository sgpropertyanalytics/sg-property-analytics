-- Migration: 017_add_ura_sync_infrastructure.sql
-- Purpose: Add URA API sync infrastructure for shadow mode
-- Date: 2026-01-10
--
-- Creates:
--   - ura_sync_runs: Track each sync run with detailed metrics
--   - Adds source, run_id, ingested_at to transactions table
--   - Indexes for efficient source-based and run-based queries
--
-- Design decisions:
--   - source and run_id are SEPARATE fields (not overloaded)
--   - source: identifies data origin ('ura_api', 'csv')
--   - run_id: links to specific sync run for comparison/audit
--   - ON CONFLICT DO UPDATE used in sync engine (not DO NOTHING)
--     to allow revision window corrections

-- ============================================================================
-- 1. URA Sync Runs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS ura_sync_runs (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,

    -- Status: running | succeeded | failed | cancelled
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),

    -- Configuration
    revision_window_months INTEGER NOT NULL DEFAULT 3,
    cutoff_date DATE,  -- Only sync transactions >= this date
    mode TEXT NOT NULL DEFAULT 'shadow'
        CHECK (mode IN ('shadow', 'production', 'dry_run')),

    -- Token tracking
    token_refreshed BOOLEAN DEFAULT FALSE,
    token_obtained_at TIMESTAMPTZ,

    -- Batch progress
    batches_total INTEGER DEFAULT 4,
    batches_completed INTEGER DEFAULT 0,
    current_batch INTEGER,

    -- Granular skip counters (from mapper)
    counters JSONB DEFAULT '{}'::JSONB,
    -- Expected structure:
    -- {
    --   "skip_invalid_date": 0,
    --   "skip_invalid_price": 0,
    --   "skip_invalid_area": 0,
    --   "skip_missing_project": 0,
    --   "skip_exception": 0,
    --   "unknown_fields_preserved": 0
    -- }

    -- Totals
    totals JSONB DEFAULT '{}'::JSONB,
    -- Expected structure:
    -- {
    --   "raw_projects": 0,
    --   "raw_transactions": 0,
    --   "mapped_rows": 0,
    --   "inserted_rows": 0,
    --   "updated_rows": 0,
    --   "unchanged_rows": 0
    -- }

    -- API response metadata
    api_response_times JSONB,  -- {"batch_1": 1.23, "batch_2": 0.98, ...}
    api_retry_counts JSONB,    -- {"batch_1": 0, "batch_2": 1, ...}

    -- Comparison results (populated after sync)
    comparison_baseline_run_id UUID,
    comparison_results JSONB,
    -- Expected structure:
    -- {
    --   "count_diff_by_district": {...},
    --   "psf_diff_median": {...},
    --   "psf_diff_p95": {...},
    --   "coverage_pct": 99.5
    -- }

    -- Versioning (for reproducibility)
    git_sha TEXT,
    mapper_version TEXT,

    -- Error tracking
    error_message TEXT,
    error_stage TEXT,  -- 'token', 'fetch', 'map', 'insert', 'compare'
    error_details JSONB,

    -- Notes
    notes TEXT,
    triggered_by TEXT DEFAULT 'cron'
        CHECK (triggered_by IN ('cron', 'manual', 'backfill', 'test'))
);

-- Indexes for ura_sync_runs
CREATE INDEX IF NOT EXISTS idx_ura_sync_runs_status ON ura_sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_ura_sync_runs_started ON ura_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ura_sync_runs_mode ON ura_sync_runs(mode);


-- ============================================================================
-- 2. Add source, run_id, ingested_at to transactions
-- ============================================================================

-- source: identifies data origin
-- Default 'csv' for backward compatibility with existing data
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'csv';

-- run_id: links to specific sync run (NULL for legacy CSV data)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS run_id UUID;

-- ingested_at: when this row was inserted/updated
-- Different from created_at which is original insertion
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- ============================================================================
-- 3. Add foreign key constraint (run_id -> ura_sync_runs.id)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_transactions_run_id'
    ) THEN
        ALTER TABLE transactions
        ADD CONSTRAINT fk_transactions_run_id
        FOREIGN KEY (run_id) REFERENCES ura_sync_runs(id)
        ON DELETE SET NULL;
    END IF;
END $$;


-- ============================================================================
-- 4. Add indexes for efficient querying
-- ============================================================================

-- Index on source for filtering by data origin
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);

-- Index on run_id for run-specific queries
CREATE INDEX IF NOT EXISTS idx_transactions_run_id ON transactions(run_id)
WHERE run_id IS NOT NULL;

-- Composite index for revision window queries
-- (source + transaction_month for efficient date-range filtering by source)
CREATE INDEX IF NOT EXISTS idx_transactions_source_month
ON transactions(source, transaction_month DESC)
WHERE transaction_month IS NOT NULL;

-- Composite index for comparison queries
-- (source + district + transaction_month for aggregation)
CREATE INDEX IF NOT EXISTS idx_transactions_source_district_month
ON transactions(source, district, transaction_month)
WHERE COALESCE(is_outlier, false) = false;


-- ============================================================================
-- 5. Add columns to transactions_staging for run tracking
-- ============================================================================

DO $$
BEGIN
    -- Add source column to staging
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions_staging' AND column_name = 'source'
    ) THEN
        ALTER TABLE transactions_staging ADD COLUMN source TEXT DEFAULT 'csv';
    END IF;

    -- Add run_id column to staging
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions_staging' AND column_name = 'run_id'
    ) THEN
        ALTER TABLE transactions_staging ADD COLUMN run_id UUID;
    END IF;
END $$;


-- ============================================================================
-- 6. Set source='csv' for all existing data (one-time backfill)
-- ============================================================================

-- This ensures existing data has explicit source
UPDATE transactions
SET source = 'csv'
WHERE source IS NULL OR source = '';

-- Set ingested_at to created_at for existing records
UPDATE transactions
SET ingested_at = COALESCE(created_at, NOW())
WHERE ingested_at IS NULL;


-- ============================================================================
-- 7. Verification queries
-- ============================================================================

-- Run these to verify migration:
--
-- Check new columns exist:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'transactions'
--   AND column_name IN ('source', 'run_id', 'ingested_at');
--
-- Check ura_sync_runs table:
-- SELECT * FROM information_schema.tables WHERE table_name = 'ura_sync_runs';
--
-- Check source distribution:
-- SELECT source, COUNT(*) FROM transactions GROUP BY source;
--
-- Check indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'transactions' AND indexname LIKE '%source%';
