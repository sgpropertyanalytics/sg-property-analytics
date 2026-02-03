-- Normalize legacy CSV source labels to a single canonical value.
-- This keeps analytics and comparisons consistent and simpler.

UPDATE transactions
SET source = 'csv'
WHERE source = 'csv_offline';
