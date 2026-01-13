-- Migration 000: Create all tables from scratch (for fresh database setup)
-- This migration is IDEMPOTENT - safe to run multiple times
-- Run with: psql "$DATABASE_URL" -f backend/migrations/000_create_all_tables.sql
--
-- This is the FIRST migration to run on a fresh Render database.
-- Creates all tables that db.create_all() would create, but for production.
--
-- Created: 2025-01
-- Models: transactions, upcoming_launches, gls_tenders, project_locations,
--         popular_schools, precomputed_stats

-- =============================================================================
-- TRANSACTIONS TABLE (main data table)
-- =============================================================================

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(255) NOT NULL,
    transaction_date DATE NOT NULL,
    contract_date VARCHAR(10),
    price FLOAT NOT NULL,
    area_sqft FLOAT NOT NULL,
    psf FLOAT NOT NULL,
    district VARCHAR(10) NOT NULL,
    bedroom_count INTEGER NOT NULL,
    property_type VARCHAR(100) DEFAULT 'Condominium',
    sale_type VARCHAR(50),
    tenure TEXT,
    lease_start_year INTEGER,
    remaining_lease INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    -- CSV parity columns
    street_name TEXT,
    floor_range TEXT,
    floor_level TEXT,
    num_units INTEGER,
    nett_price FLOAT,
    type_of_area TEXT,
    market_segment TEXT,
    -- Outlier flag
    is_outlier BOOLEAN DEFAULT FALSE,
    -- Data source tracking
    source TEXT NOT NULL DEFAULT 'csv',
    run_id VARCHAR(36),
    ingested_at TIMESTAMP DEFAULT NOW()
);

-- Core indexes for transactions
CREATE INDEX IF NOT EXISTS ix_transactions_project_name ON transactions(project_name);
CREATE INDEX IF NOT EXISTS ix_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS ix_transactions_district ON transactions(district);
CREATE INDEX IF NOT EXISTS ix_transactions_bedroom_count ON transactions(bedroom_count);
CREATE INDEX IF NOT EXISTS ix_transactions_floor_level ON transactions(floor_level);
CREATE INDEX IF NOT EXISTS ix_transactions_is_outlier ON transactions(is_outlier);
CREATE INDEX IF NOT EXISTS ix_transactions_source ON transactions(source);

-- =============================================================================
-- UPCOMING_LAUNCHES TABLE (pre-launch condo projects)
-- =============================================================================

CREATE TABLE IF NOT EXISTS upcoming_launches (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    developer VARCHAR(255),
    district VARCHAR(10),
    planning_area VARCHAR(100),
    market_segment VARCHAR(10),
    address TEXT,
    total_units INTEGER,
    units_1br INTEGER,
    units_2br INTEGER,
    units_3br INTEGER,
    units_4br INTEGER,
    units_5br_plus INTEGER,
    indicative_psf_low NUMERIC(12,2),
    indicative_psf_high NUMERIC(12,2),
    tenure TEXT,
    property_type VARCHAR(100) DEFAULT 'Condominium',
    launch_year INTEGER,
    expected_launch_date DATE,
    expected_top_date DATE,
    site_area_sqft NUMERIC(12,2),
    gls_tender_id INTEGER,
    land_bid_psf NUMERIC(12,2),
    data_source VARCHAR(255),
    data_confidence VARCHAR(20),
    needs_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT,
    updated_at TIMESTAMP DEFAULT NOW(),
    last_scraped TIMESTAMP,
    last_validated TIMESTAMP
);

-- Indexes for upcoming_launches
CREATE INDEX IF NOT EXISTS ix_upcoming_launches_project_name ON upcoming_launches(project_name);
CREATE INDEX IF NOT EXISTS ix_upcoming_launches_district ON upcoming_launches(district);
CREATE INDEX IF NOT EXISTS ix_upcoming_launches_market_segment ON upcoming_launches(market_segment);
CREATE INDEX IF NOT EXISTS ix_upcoming_launches_launch_year ON upcoming_launches(launch_year);

-- =============================================================================
-- GLS_TENDERS TABLE (government land sales)
-- =============================================================================

CREATE TABLE IF NOT EXISTS gls_tenders (
    id SERIAL PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    release_id VARCHAR(100) UNIQUE NOT NULL,
    release_url TEXT NOT NULL,
    location_raw TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    release_date DATE,
    tender_close_date DATE,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    planning_area VARCHAR(100),
    market_segment VARCHAR(10),
    site_area_sqm NUMERIC(12,2),
    site_area_sqft NUMERIC(12,2),
    max_gfa_sqm NUMERIC(12,2),
    max_gfa_sqft NUMERIC(12,2),
    plot_ratio NUMERIC(8,2),
    estimated_units INTEGER,
    estimated_units_source VARCHAR(50),
    successful_tenderer VARCHAR(255),
    tendered_price_sgd NUMERIC(15,2),
    num_tenderers INTEGER,
    psf_ppr NUMERIC(12,2),
    psm_gfa NUMERIC(12,2),
    psf_land NUMERIC(12,2),
    psm_land NUMERIC(12,2),
    implied_launch_psf_low NUMERIC(12,2),
    implied_launch_psf_high NUMERIC(12,2),
    secondary_source_url TEXT,
    price_validated BOOLEAN DEFAULT FALSE,
    needs_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT
);

-- Indexes for gls_tenders
CREATE INDEX IF NOT EXISTS ix_gls_tenders_status ON gls_tenders(status);
CREATE INDEX IF NOT EXISTS ix_gls_tenders_release_date ON gls_tenders(release_date);
CREATE INDEX IF NOT EXISTS ix_gls_tenders_market_segment ON gls_tenders(market_segment);

-- =============================================================================
-- PROJECT_LOCATIONS TABLE (geocoded project data)
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_locations (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    district VARCHAR(10),
    market_segment VARCHAR(10),
    planning_area VARCHAR(100),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    has_popular_school_1km BOOLEAN,
    geocode_status VARCHAR(20) DEFAULT 'pending',
    geocode_source VARCHAR(50),
    geocode_error TEXT,
    address TEXT,
    postal_code VARCHAR(10),
    transaction_count INTEGER,
    first_transaction_date DATE,
    last_transaction_date DATE,
    updated_at TIMESTAMP DEFAULT NOW(),
    last_geocoded_at TIMESTAMP
);

-- Indexes for project_locations
CREATE INDEX IF NOT EXISTS ix_project_locations_project_name ON project_locations(project_name);
CREATE INDEX IF NOT EXISTS ix_project_locations_district ON project_locations(district);
CREATE INDEX IF NOT EXISTS ix_project_locations_geocode_status ON project_locations(geocode_status);

-- =============================================================================
-- POPULAR_SCHOOLS TABLE (school proximity data)
-- =============================================================================

CREATE TABLE IF NOT EXISTS popular_schools (
    id SERIAL PRIMARY KEY,
    school_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    address TEXT,
    postal_code VARCHAR(10),
    school_type VARCHAR(50),
    planning_area VARCHAR(100)
);

-- Indexes for popular_schools
CREATE INDEX IF NOT EXISTS ix_popular_schools_school_name ON popular_schools(school_name);

-- =============================================================================
-- PRECOMPUTED_STATS TABLE (cached statistics)
-- =============================================================================

CREATE TABLE IF NOT EXISTS precomputed_stats (
    id SERIAL PRIMARY KEY,
    stat_key VARCHAR(255) UNIQUE NOT NULL,
    stat_value JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- URA_SYNC_RUNS TABLE (for run_id foreign key in transactions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ura_sync_runs (
    id VARCHAR(36) PRIMARY KEY,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'running',
    mode VARCHAR(20),
    triggered_by VARCHAR(50),
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_unchanged INTEGER DEFAULT 0,
    error_message TEXT
);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('transactions', 'upcoming_launches', 'gls_tenders',
                       'project_locations', 'popular_schools', 'precomputed_stats');

    IF table_count = 6 THEN
        RAISE NOTICE 'Migration 000 successful: all 6 core tables created';
    ELSE
        RAISE WARNING 'Migration 000 incomplete: only % of 6 tables exist', table_count;
    END IF;
END $$;
