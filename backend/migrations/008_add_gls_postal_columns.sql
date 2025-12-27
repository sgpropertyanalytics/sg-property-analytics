-- Migration: Add postal_code and postal_district columns to gls_tenders
-- Purpose: Enable district-level GLS supply tracking for the Supply Insights page
--
-- This allows GLS pipeline units to be aggregated by district (D01-D28),
-- resolving the discrepancy between regional and district supply totals.
--
-- Priority: postal_code → postal_district → market_segment (most accurate)
-- Fallback: planning_area → postal_district → market_segment

-- Add new columns
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS postal_district VARCHAR(5);

-- Add index for district-level queries
CREATE INDEX IF NOT EXISTS ix_gls_postal_district ON gls_tenders(postal_district);
CREATE INDEX IF NOT EXISTS ix_gls_status_district ON gls_tenders(status, postal_district);

-- Note: After running this migration, re-run the GLS scraper to populate
-- the new columns for existing records:
--   python -c "from services.gls_scraper import scrape_all_gls; scrape_all_gls(dry_run=False)"
