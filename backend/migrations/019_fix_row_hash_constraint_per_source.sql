-- Migration 019: Remove row_hash uniqueness constraint
--
-- row_hash is a JOIN KEY for matching transactions across sources,
-- not a unique identifier. Real property data has legitimate collisions:
-- same project + month + price + area + floor + sale_type + district
-- but different transaction_date (different units with identical specs).
--
-- Enforcing uniqueness forces data loss (~10% of CSV rows would be NULL).
-- Handle 1-to-many matches in the comparator layer instead.
-- ============================================================================

-- 1. Drop all unique indexes on row_hash
DROP INDEX IF EXISTS idx_transactions_row_hash;
DROP INDEX IF EXISTS idx_transactions_row_hash_unique;
DROP INDEX IF EXISTS idx_transactions_source_row_hash_unique;

-- 2. Non-unique index for shadow comparison joins
CREATE INDEX IF NOT EXISTS idx_transactions_row_hash_lookup
ON transactions(row_hash)
WHERE row_hash IS NOT NULL;

-- 3. Composite index for source-filtered lookups (workhorse for most queries)
CREATE INDEX IF NOT EXISTS idx_transactions_source_row_hash
ON transactions(source, row_hash)
WHERE row_hash IS NOT NULL;
