-- Migration: 009_add_etl_batch_tables.sql
-- Purpose: Add ETL batch tracking and audit infrastructure
-- Date: 2025-01-01
--
-- Creates:
--   - etl_batches: Batch tracking with full audit trail
--   - Adds batch_id, row_hash columns to transactions_staging
--   - Adds row_hash, transaction_month, psf_source, psf_calc to transactions
--   - Adds DB constraints as guardrails

-- ============================================================================
-- 1. ETL Batch Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS etl_batches (
    id SERIAL PRIMARY KEY,
    batch_id UUID NOT NULL UNIQUE,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Status: staging | validating | promoting | completed | failed | rolled_back
    status VARCHAR(20) NOT NULL DEFAULT 'staging',

    -- Source tracking
    file_fingerprints JSONB,  -- {"filename": "sha256", ...}
    total_files INTEGER DEFAULT 0,

    -- Versioning (for reproducibility)
    schema_version VARCHAR(20) NOT NULL,
    rules_version VARCHAR(40) NOT NULL,  -- git hash or file hash
    contract_hash VARCHAR(32) NOT NULL,  -- hash of schema JSON content
    header_fingerprint VARCHAR(64),       -- sorted header list hash

    -- Row counts by stage
    rows_loaded INTEGER DEFAULT 0,
    rows_after_dedup INTEGER DEFAULT 0,
    rows_outliers_marked INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    rows_skipped_collision INTEGER DEFAULT 0,

    -- Validation
    validation_passed BOOLEAN,
    validation_issues JSONB,
    semantic_warnings JSONB,  -- PSF mismatch, region cross-check failures

    -- Contract compatibility report
    contract_report JSONB,  -- missing_required, aliases_used, unknown_headers

    -- Error tracking
    error_message TEXT,
    error_stage VARCHAR(50),

    -- Retention
    retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),

    -- Audit
    triggered_by VARCHAR(100) DEFAULT 'manual',

    CONSTRAINT etl_batches_valid_status CHECK (status IN (
        'staging', 'validating', 'promoting', 'completed', 'failed', 'rolled_back'
    ))
);

CREATE INDEX IF NOT EXISTS idx_etl_batches_status ON etl_batches(status);
CREATE INDEX IF NOT EXISTS idx_etl_batches_started ON etl_batches(started_at DESC);


-- ============================================================================
-- 2. Add columns to transactions_staging (if table exists)
-- ============================================================================

DO $$
BEGIN
    -- Add batch_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions_staging' AND column_name = 'batch_id'
    ) THEN
        ALTER TABLE transactions_staging ADD COLUMN batch_id UUID;
    END IF;

    -- Add staged_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions_staging' AND column_name = 'staged_at'
    ) THEN
        ALTER TABLE transactions_staging ADD COLUMN staged_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Add row_hash column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions_staging' AND column_name = 'row_hash'
    ) THEN
        ALTER TABLE transactions_staging ADD COLUMN row_hash TEXT;
    END IF;

    -- Add raw_extras column for unknown columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions_staging' AND column_name = 'raw_extras'
    ) THEN
        ALTER TABLE transactions_staging ADD COLUMN raw_extras JSONB;
    END IF;
END $$;


-- ============================================================================
-- 3. Add staging indexes (if table exists)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions_staging') THEN
        -- Index on batch_id for batch-scoped queries
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE indexname = 'idx_staging_batch'
        ) THEN
            CREATE INDEX idx_staging_batch ON transactions_staging(batch_id);
        END IF;

        -- Unique index on (batch_id, row_hash) for in-batch deduplication
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE indexname = 'idx_staging_batch_row_hash'
        ) THEN
            CREATE UNIQUE INDEX idx_staging_batch_row_hash ON transactions_staging(batch_id, row_hash)
            WHERE row_hash IS NOT NULL;
        END IF;
    END IF;
END $$;


-- ============================================================================
-- 4. Add new columns to production transactions table
-- ============================================================================

-- Add row_hash for idempotent promotion
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS row_hash TEXT;

-- Add transaction_month for month-granularity canonical date
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_month DATE;

-- Add PSF tracking columns for reconciliation
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS psf_source FLOAT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS psf_calc FLOAT;

-- Add market_segment_raw for audit (URA's human label)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS market_segment_raw TEXT;

-- Add raw_extras for unknown columns
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_extras JSONB;


-- ============================================================================
-- 5. Migrate existing transaction_date to transaction_month
-- ============================================================================

UPDATE transactions
SET transaction_month = DATE_TRUNC('month', transaction_date)::DATE
WHERE transaction_month IS NULL AND transaction_date IS NOT NULL;


-- ============================================================================
-- 6. Add unique index on row_hash for idempotent promotion
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_row_hash'
    ) THEN
        CREATE UNIQUE INDEX idx_transactions_row_hash ON transactions(row_hash)
        WHERE row_hash IS NOT NULL;
    END IF;
END $$;


-- ============================================================================
-- 7. Add DB Constraints (guardrails)
-- ============================================================================

DO $$
BEGIN
    -- Check price > 0
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_price_positive'
    ) THEN
        ALTER TABLE transactions
        ADD CONSTRAINT chk_transactions_price_positive CHECK (price > 0);
    END IF;

    -- Check area_sqft > 0
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_area_positive'
    ) THEN
        ALTER TABLE transactions
        ADD CONSTRAINT chk_transactions_area_positive CHECK (area_sqft > 0);
    END IF;

    -- Check psf > 0
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_psf_positive'
    ) THEN
        ALTER TABLE transactions
        ADD CONSTRAINT chk_transactions_psf_positive CHECK (psf > 0);
    END IF;
END $$;


-- ============================================================================
-- 8. Create retention cleanup function (optional, can be run via cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_staging_data(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete staging rows older than retention period
    DELETE FROM transactions_staging
    WHERE staged_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Update etl_batches retention status
    UPDATE etl_batches
    SET status = 'archived'
    WHERE retention_until < NOW()
      AND status = 'completed';

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 9. Summary
-- ============================================================================

-- Run this to verify migration:
-- SELECT
--     (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'etl_batches') as etl_batches_exists,
--     (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'row_hash') as row_hash_exists,
--     (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'transaction_month') as transaction_month_exists;
