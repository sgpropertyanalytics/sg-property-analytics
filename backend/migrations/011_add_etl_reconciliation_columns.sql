-- Migration: 011_add_etl_reconciliation_columns.sql
-- Purpose: Add source reconciliation columns to etl_batches for complete audit trail
-- Date: 2025-12-29
--
-- Enables the invariant: source_row_count = rows_loaded + rows_rejected + rows_skipped
-- This allows hard verification that zero rows are silently dropped.

-- ============================================================================
-- 1. Add reconciliation columns to etl_batches
-- ============================================================================

-- source_row_count: Total raw rows read from CSV files (before any parsing)
-- Nullable initially; once reliably populated, can add NOT NULL constraint
ALTER TABLE etl_batches
  ADD COLUMN IF NOT EXISTS source_row_count INTEGER;

-- rows_rejected: Rows that failed parse/validation (logged with reasons)
ALTER TABLE etl_batches
  ADD COLUMN IF NOT EXISTS rows_rejected INTEGER NOT NULL DEFAULT 0;

-- rows_skipped: Rows skipped at source level (e.g., empty rows, header rows in middle of file)
-- Note: rows_skipped_collision already exists for dedup collisions at promote time
ALTER TABLE etl_batches
  ADD COLUMN IF NOT EXISTS rows_skipped INTEGER NOT NULL DEFAULT 0;


-- ============================================================================
-- 2. Add check constraints for data integrity
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'etl_batches_nonneg_counts'
    ) THEN
        ALTER TABLE etl_batches
        ADD CONSTRAINT etl_batches_nonneg_counts CHECK (
            (source_row_count IS NULL OR source_row_count >= 0)
            AND rows_rejected >= 0
            AND rows_skipped >= 0
        );
    END IF;
END $$;


-- ============================================================================
-- 3. Add reconciliation check function (for validation queries)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_batch_reconciliation(p_batch_id UUID)
RETURNS TABLE (
    batch_id UUID,
    source_row_count INTEGER,
    rows_loaded INTEGER,
    rows_rejected INTEGER,
    rows_skipped INTEGER,
    accounted INTEGER,
    unaccounted INTEGER,
    reconciliation_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.batch_id,
        b.source_row_count,
        b.rows_loaded,
        b.rows_rejected,
        b.rows_skipped,
        (b.rows_loaded + b.rows_rejected + b.rows_skipped)::INTEGER as accounted,
        CASE
            WHEN b.source_row_count IS NULL THEN NULL
            ELSE (b.source_row_count - b.rows_loaded - b.rows_rejected - b.rows_skipped)::INTEGER
        END as unaccounted,
        CASE
            WHEN b.source_row_count IS NULL THEN 'UNKNOWN'
            WHEN b.source_row_count = b.rows_loaded + b.rows_rejected + b.rows_skipped THEN 'OK'
            ELSE 'MISMATCH'
        END as reconciliation_status
    FROM etl_batches b
    WHERE b.batch_id = p_batch_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 4. Verification query
-- ============================================================================

-- Run this to verify migration:
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'etl_batches'
--   AND column_name IN ('source_row_count', 'rows_rejected', 'rows_skipped');

-- Test reconciliation function:
-- SELECT * FROM check_batch_reconciliation('your-batch-id-here');
