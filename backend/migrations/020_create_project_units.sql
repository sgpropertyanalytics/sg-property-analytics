-- Migration: 020_create_project_units.sql
-- Description: Create project_units table for canonical registry of condo projects and unit counts
-- Created: 2026-01-12
--
-- This table serves as the single source of truth for:
-- 1. Project existence (every condo that appears in transactions)
-- 2. Unit counts (total_units, with provenance tracking)
--
-- Replaces the CSV-based lookup in backend/data/new_launch_units.csv

-- =============================================================================
-- PROJECT UNITS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_units (
    id SERIAL PRIMARY KEY,

    -- =========================================================================
    -- PROJECT IDENTIFICATION
    -- =========================================================================
    -- Normalized key for stable lookups (slugified, lowercase)
    -- Example: "THE SAIL @ MARINA BAY" -> "sail-at-marina-bay"
    project_key VARCHAR(255) NOT NULL UNIQUE,

    -- Original project name as first encountered (preserves casing/punctuation)
    project_name_raw VARCHAR(255) NOT NULL,

    -- Canonical display name (normalized but human-readable)
    -- Example: "SAIL AT MARINA BAY"
    project_name_canonical VARCHAR(255) NOT NULL,

    -- =========================================================================
    -- LOCATION
    -- =========================================================================
    district VARCHAR(10),  -- D01-D28

    -- =========================================================================
    -- UNIT DATA
    -- =========================================================================
    total_units INTEGER,  -- NULL if unknown

    -- Status of unit data:
    -- 'verified' - confirmed from trusted source
    -- 'unknown' - project exists but units not known
    -- 'conflict' - sold count > total_units, needs review
    units_status VARCHAR(20) NOT NULL DEFAULT 'unknown'
        CHECK (units_status IN ('verified', 'unknown', 'conflict')),

    -- =========================================================================
    -- PROJECT METADATA (Optional, populated when available)
    -- =========================================================================
    developer VARCHAR(255),
    tenure TEXT,  -- 'Freehold', '99-year', '999-year'
    top_year INTEGER,  -- Temporary Occupation Permit year

    -- =========================================================================
    -- DATA PROVENANCE
    -- =========================================================================
    -- Where the unit count came from:
    -- 'csv' - from new_launch_units.csv
    -- 'scraper:edgeprop' - from EdgeProp scraper
    -- 'scraper:99co' - from 99.co scraper
    -- 'manual' - manually entered
    -- 'transactions' - inferred from transactions (existence only, no units)
    data_source VARCHAR(100),

    -- Confidence in the unit count (0.00 - 1.00)
    -- NULL if units_status is 'unknown'
    confidence_score DECIMAL(3, 2)
        CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),

    -- When the unit count was last verified against external source
    last_verified_at TIMESTAMP,

    -- =========================================================================
    -- REVIEW FLAGS
    -- =========================================================================
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    review_reason TEXT,

    -- =========================================================================
    -- TIMESTAMPS
    -- =========================================================================
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary lookup by normalized key (already unique, but explicit index for clarity)
CREATE INDEX IF NOT EXISTS ix_project_units_key ON project_units(project_key);

-- Location-based queries
CREATE INDEX IF NOT EXISTS ix_project_units_district ON project_units(district);

-- Status-based queries (find projects needing attention)
CREATE INDEX IF NOT EXISTS ix_project_units_status ON project_units(units_status);

-- Composite index for common query pattern: coverage by district
CREATE INDEX IF NOT EXISTS ix_project_units_district_status ON project_units(district, units_status);

-- Find projects needing review
CREATE INDEX IF NOT EXISTS ix_project_units_needs_review ON project_units(needs_review)
    WHERE needs_review = TRUE;

-- =============================================================================
-- TRIGGER: Auto-update updated_at on row modification
-- =============================================================================
CREATE OR REPLACE FUNCTION update_project_units_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_units_updated_at ON project_units;
CREATE TRIGGER trigger_project_units_updated_at
    BEFORE UPDATE ON project_units
    FOR EACH ROW
    EXECUTE FUNCTION update_project_units_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE project_units IS 'Canonical registry of condo projects and unit counts - replaces CSV-based lookup';
COMMENT ON COLUMN project_units.project_key IS 'Normalized/slugified project name for stable lookups';
COMMENT ON COLUMN project_units.project_name_raw IS 'Original project name preserving casing and punctuation';
COMMENT ON COLUMN project_units.project_name_canonical IS 'Normalized but human-readable project name';
COMMENT ON COLUMN project_units.units_status IS 'verified=confirmed, unknown=exists but no units, conflict=sold>total';
COMMENT ON COLUMN project_units.data_source IS 'Provenance: csv, scraper:edgeprop, scraper:99co, manual, transactions';
COMMENT ON COLUMN project_units.confidence_score IS 'Confidence in unit count (0.00-1.00), NULL if unknown';
