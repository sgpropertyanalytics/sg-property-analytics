-- Migration: Add missing CSV columns to transactions table
-- Date: 2025-12-20
-- Description: Adds columns that were previously dropped during CSV import
--
-- Previously, the data_loader.py clean_csv_data() function used a whitelist
-- that dropped several columns from the raw CSV data. This migration adds
-- those columns back to the database schema.
--
-- New columns:
--   street_name    - Full address from "Street Name" CSV column
--   floor_range    - Raw floor range, e.g., "01 to 05"
--   floor_level    - Classified floor level: Low, Mid-Low, Mid, Mid-High, High, Luxury
--   num_units      - Number of units in transaction (for new sales bulk transactions)
--   nett_price     - Alternative price metric from "Nett Price ($)" column
--   type_of_area   - "Strata" or "Land" from "Type of Area" column
--   market_segment - URA's CCR/RCR/OCR classification from "Market Segment" column
--
-- All columns are nullable for backward compatibility with existing data.
-- After running this migration, use reimport_csv.py to populate the new columns.

-- Add street_name column
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS street_name TEXT;

-- Add floor_range column
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS floor_range VARCHAR(20);

-- Add floor_level column with index for filtering
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS floor_level VARCHAR(20);

-- Add num_units column
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS num_units INTEGER;

-- Add nett_price column
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS nett_price FLOAT;

-- Add type_of_area column
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS type_of_area VARCHAR(20);

-- Add market_segment column
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS market_segment VARCHAR(10);

-- Create index on floor_level for efficient filtering
CREATE INDEX IF NOT EXISTS idx_transactions_floor_level
ON transactions(floor_level);

-- Verify columns were added
DO $$
BEGIN
    RAISE NOTICE 'Migration complete. New columns added to transactions table:';
    RAISE NOTICE '  - street_name (TEXT)';
    RAISE NOTICE '  - floor_range (VARCHAR(20))';
    RAISE NOTICE '  - floor_level (VARCHAR(20), indexed)';
    RAISE NOTICE '  - num_units (INTEGER)';
    RAISE NOTICE '  - nett_price (FLOAT)';
    RAISE NOTICE '  - type_of_area (VARCHAR(20))';
    RAISE NOTICE '  - market_segment (VARCHAR(10))';
    RAISE NOTICE '';
    RAISE NOTICE 'To populate these columns, run: python -m scripts.reimport_csv';
END $$;
