-- Migration: Add missing CSV columns to transactions table
-- Run with: psql "$DATABASE_URL" -f backend/migrations/add_missing_csv_columns.sql

-- Add new columns (IF NOT EXISTS prevents errors if already present)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS street_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS floor_range VARCHAR(20);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS floor_level VARCHAR(20);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS num_units INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS nett_price FLOAT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type_of_area VARCHAR(20);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS market_segment VARCHAR(10);

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('street_name', 'floor_range', 'floor_level', 'num_units', 'nett_price', 'type_of_area', 'market_segment')
ORDER BY column_name;
