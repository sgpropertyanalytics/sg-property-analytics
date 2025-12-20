-- Migration 001: Add all missing columns across all models
-- This migration is IDEMPOTENT - safe to run multiple times
-- Run with: psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql
--
-- Created: 2024
-- Models affected: transactions, new_launches, gls_tenders, project_locations

-- =============================================================================
-- TRANSACTIONS TABLE
-- New columns for CSV parity (URA REALIS format)
-- =============================================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS street_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS floor_range VARCHAR(20);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS floor_level VARCHAR(20);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS num_units INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS nett_price FLOAT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type_of_area VARCHAR(20);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS market_segment VARCHAR(10);

-- Index for floor_level queries
CREATE INDEX IF NOT EXISTS ix_transactions_floor_level ON transactions(floor_level);

-- =============================================================================
-- NEW_LAUNCHES TABLE
-- Full schema for new launches tracking
-- =============================================================================

-- Create table if not exists (for fresh installs)
CREATE TABLE IF NOT EXISTS new_launches (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add all columns (idempotent)
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS developer VARCHAR(255);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS district VARCHAR(10);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS planning_area VARCHAR(100);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS market_segment VARCHAR(10);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS total_units INTEGER;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS units_1br INTEGER;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS units_2br INTEGER;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS units_3br INTEGER;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS units_4br INTEGER;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS units_5br_plus INTEGER;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS indicative_psf_low NUMERIC(12,2);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS indicative_psf_high NUMERIC(12,2);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS tenure TEXT;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS property_type VARCHAR(100) DEFAULT 'Condominium';
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS launch_year INTEGER;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS expected_launch_date DATE;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS expected_top_date DATE;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS site_area_sqft NUMERIC(12,2);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS gls_tender_id INTEGER;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS land_bid_psf NUMERIC(12,2);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS data_source VARCHAR(255);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS data_confidence VARCHAR(20);
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE new_launches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Indexes for new_launches
CREATE INDEX IF NOT EXISTS ix_new_launches_project_name ON new_launches(project_name);
CREATE INDEX IF NOT EXISTS ix_new_launches_developer ON new_launches(developer);
CREATE INDEX IF NOT EXISTS ix_new_launches_district ON new_launches(district);
CREATE INDEX IF NOT EXISTS ix_new_launches_planning_area ON new_launches(planning_area);
CREATE INDEX IF NOT EXISTS ix_new_launches_market_segment ON new_launches(market_segment);
CREATE INDEX IF NOT EXISTS ix_new_launches_launch_year ON new_launches(launch_year);
CREATE INDEX IF NOT EXISTS ix_new_launches_needs_review ON new_launches(needs_review);
CREATE INDEX IF NOT EXISTS ix_new_launches_segment_year ON new_launches(market_segment, launch_year);
CREATE INDEX IF NOT EXISTS ix_new_launches_district_year ON new_launches(district, launch_year);

-- =============================================================================
-- GLS_TENDERS TABLE
-- Ensure all columns exist
-- =============================================================================

CREATE TABLE IF NOT EXISTS gls_tenders (
    id SERIAL PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    release_id VARCHAR(100) UNIQUE NOT NULL,
    release_url TEXT NOT NULL,
    location_raw TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS tender_close_date DATE;
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS planning_area VARCHAR(100);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS market_segment VARCHAR(10);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS site_area_sqm NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS site_area_sqft NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS max_gfa_sqm NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS max_gfa_sqft NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS plot_ratio NUMERIC(8,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS estimated_units INTEGER;
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS estimated_units_source VARCHAR(50);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS successful_tenderer VARCHAR(255);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS tendered_price_sgd NUMERIC(15,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS num_tenderers INTEGER;
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS psf_ppr NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS psm_gfa NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS psf_land NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS psm_land NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS implied_launch_psf_low NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS implied_launch_psf_high NUMERIC(12,2);
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS secondary_source_url TEXT;
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS price_validated BOOLEAN DEFAULT FALSE;
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- Indexes for gls_tenders
CREATE INDEX IF NOT EXISTS ix_gls_tenders_status ON gls_tenders(status);
CREATE INDEX IF NOT EXISTS ix_gls_tenders_market_segment ON gls_tenders(market_segment);
CREATE INDEX IF NOT EXISTS ix_gls_status_segment ON gls_tenders(status, market_segment);
CREATE INDEX IF NOT EXISTS ix_gls_release_date ON gls_tenders(release_date);

-- =============================================================================
-- PROJECT_LOCATIONS TABLE
-- Ensure all columns exist
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_locations (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS district VARCHAR(10);
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS market_segment VARCHAR(10);
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS planning_area VARCHAR(100);
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS has_popular_school_1km BOOLEAN;
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS geocode_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS geocode_source VARCHAR(50);
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS geocode_error TEXT;
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10);
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS transaction_count INTEGER;
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS first_transaction_date DATE;
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS last_transaction_date DATE;
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS last_geocoded_at TIMESTAMP;

-- Indexes for project_locations
CREATE INDEX IF NOT EXISTS ix_project_locations_project_name ON project_locations(project_name);
CREATE INDEX IF NOT EXISTS ix_project_locations_district ON project_locations(district);
CREATE INDEX IF NOT EXISTS ix_project_locations_market_segment ON project_locations(market_segment);
CREATE INDEX IF NOT EXISTS ix_project_locations_planning_area ON project_locations(planning_area);
CREATE INDEX IF NOT EXISTS ix_project_locations_geocode_status ON project_locations(geocode_status);
CREATE INDEX IF NOT EXISTS ix_project_locations_has_popular_school_1km ON project_locations(has_popular_school_1km);
CREATE INDEX IF NOT EXISTS ix_project_locations_segment_school ON project_locations(market_segment, has_popular_school_1km);
CREATE INDEX IF NOT EXISTS ix_project_locations_district_school ON project_locations(district, has_popular_school_1km);

-- =============================================================================
-- POPULAR_SCHOOLS TABLE (if used)
-- =============================================================================

CREATE TABLE IF NOT EXISTS popular_schools (
    id SERIAL PRIMARY KEY,
    school_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE popular_schools ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE popular_schools ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE popular_schools ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE popular_schools ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10);
ALTER TABLE popular_schools ADD COLUMN IF NOT EXISTS school_type VARCHAR(50);
ALTER TABLE popular_schools ADD COLUMN IF NOT EXISTS planning_area VARCHAR(100);

-- =============================================================================
-- PRECOMPUTED_STATS TABLE (if used)
-- =============================================================================

CREATE TABLE IF NOT EXISTS precomputed_stats (
    id SERIAL PRIMARY KEY,
    stat_key VARCHAR(255) UNIQUE NOT NULL,
    stat_value JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- VERIFICATION QUERY
-- Run this after migration to verify columns exist
-- =============================================================================

DO $$
DECLARE
    missing_cols TEXT := '';
BEGIN
    -- Check transactions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='street_name') THEN
        missing_cols := missing_cols || 'transactions.street_name, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='floor_level') THEN
        missing_cols := missing_cols || 'transactions.floor_level, ';
    END IF;

    -- Check new_launches
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='new_launches' AND column_name='data_source') THEN
        missing_cols := missing_cols || 'new_launches.data_source, ';
    END IF;

    IF missing_cols != '' THEN
        RAISE WARNING 'Missing columns after migration: %', missing_cols;
    ELSE
        RAISE NOTICE 'All required columns present';
    END IF;
END $$;

-- Print column counts for verification
SELECT
    table_name,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('transactions', 'new_launches', 'gls_tenders', 'project_locations')
GROUP BY table_name
ORDER BY table_name;
