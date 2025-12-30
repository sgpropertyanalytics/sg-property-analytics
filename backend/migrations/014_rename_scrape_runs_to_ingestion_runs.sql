-- Migration: 014_rename_scrape_runs_to_ingestion_runs.sql
-- Description: Rename scrape_runs to ingestion_runs and add source_type column
-- Purpose: Unified ingestion pattern (Phase 1) - support scrape, csv_upload, and api sources
-- Created: 2024-12-30

-- =============================================================================
-- STEP 1: Rename table
-- =============================================================================
ALTER TABLE IF EXISTS scrape_runs RENAME TO ingestion_runs;

-- =============================================================================
-- STEP 2: Add source_type column
-- =============================================================================
-- source_type indicates how data was ingested:
-- - 'scrape': Web scraping (e.g., URA GLS)
-- - 'csv_upload': CSV file upload (e.g., REALIS, upcoming_launches)
-- - 'api': API call (e.g., OneMap)
-- - 'manual': Manual entry/edit
ALTER TABLE ingestion_runs
ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'scrape'
    CHECK (source_type IN ('scrape', 'csv_upload', 'api', 'manual'));

-- =============================================================================
-- STEP 3: Rename indexes (PostgreSQL renames automatically, but be explicit)
-- =============================================================================
ALTER INDEX IF EXISTS ix_scrape_runs_scraper_started
    RENAME TO ix_ingestion_runs_scraper_started;
ALTER INDEX IF EXISTS ix_scrape_runs_domain_started
    RENAME TO ix_ingestion_runs_domain_started;
ALTER INDEX IF EXISTS ix_scrape_runs_status
    RENAME TO ix_ingestion_runs_status;
ALTER INDEX IF EXISTS ix_scrape_runs_run_id
    RENAME TO ix_ingestion_runs_run_id;

-- =============================================================================
-- STEP 4: Add index for source_type queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS ix_ingestion_runs_source_type
    ON ingestion_runs(source_type);

CREATE INDEX IF NOT EXISTS ix_ingestion_runs_source_type_started
    ON ingestion_runs(source_type, started_at DESC);

-- =============================================================================
-- STEP 5: Update foreign key references in scraped_entities
-- =============================================================================
-- The foreign key constraint references scrape_runs(run_id) which is now ingestion_runs(run_id)
-- PostgreSQL handles this automatically when renaming tables, but let's ensure consistency

-- =============================================================================
-- STEP 6: Update comments
-- =============================================================================
COMMENT ON TABLE ingestion_runs IS 'Tracks individual ingestion run executions (scrape, csv_upload, api, manual)';
COMMENT ON COLUMN ingestion_runs.source_type IS 'Type of ingestion: scrape, csv_upload, api, or manual';

-- =============================================================================
-- MIGRATION VERIFICATION
-- =============================================================================
-- After running this migration, verify with:
-- SELECT COUNT(*) FROM ingestion_runs;
-- SELECT DISTINCT source_type FROM ingestion_runs;
-- \d ingestion_runs
