-- Migration 001: Add all missing columns across all models
-- This migration is IDEMPOTENT - safe to run multiple times
-- Run with: psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql
--
-- NOTE: This migration adds COLUMNS ONLY. Indexes are in a separate file
-- (002_add_indexes.sql) to avoid table locks during deployment.
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
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    missing_cols TEXT := '';
BEGIN
    -- Check critical columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='street_name') THEN
        missing_cols := missing_cols || 'transactions.street_name, ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='new_launches' AND column_name='data_source') THEN
        missing_cols := missing_cols || 'new_launches.data_source, ';
    END IF;

    IF missing_cols != '' THEN
        RAISE WARNING 'Migration may have failed. Missing: %', missing_cols;
    ELSE
        RAISE NOTICE 'Migration successful: all columns present';
    END IF;
END $$;
