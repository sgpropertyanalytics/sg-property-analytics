-- Migration 021: Add unique constraint on (source, row_hash) for upsert support
--
-- Problem: Migration 019 dropped the unique index on row_hash, but
-- ura_sync_engine.py uses ON CONFLICT (row_hash) which requires uniqueness.
-- Result: 100% upsert failure rate since Jan 11.
--
-- Solution: Create unique index on (source, row_hash) to allow:
-- - Same row_hash from different sources (CSV vs URA API) - legitimate
-- - No duplicate row_hash within the same source - required for upsert
--
-- The ON CONFLICT clause in ura_sync_config.py must also be updated to:
-- ON CONFLICT (source, row_hash) WHERE row_hash IS NOT NULL
-- ============================================================================

-- 1. Drop the non-unique index if it exists (we're replacing it with unique)
DROP INDEX IF EXISTS idx_transactions_source_row_hash;

-- 2. Create unique index on (source, row_hash) for upsert support
-- This allows ON CONFLICT (source, row_hash) in the sync engine
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_source_row_hash_unique
ON transactions(source, row_hash)
WHERE row_hash IS NOT NULL;

-- 3. Keep the lookup index for shadow comparison (non-unique, row_hash only)
-- This was created in migration 019 and is still useful for joins
-- idx_transactions_row_hash_lookup already exists, no action needed

-- Verification query:
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'transactions' AND indexname LIKE '%row_hash%';
