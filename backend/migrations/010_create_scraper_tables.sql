-- Migration: 010_create_scraper_tables.sql
-- Description: Create tables for the scraping orchestrator infrastructure
-- Created: 2024-12-29

-- =============================================================================
-- LAYER 1: SCRAPE RUNS (Job Tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS scrape_runs (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR(36) UNIQUE NOT NULL,

    -- Scraper identification
    scraper_name VARCHAR(100) NOT NULL,
    source_domain VARCHAR(255) NOT NULL,
    source_tier CHAR(1) NOT NULL CHECK (source_tier IN ('A', 'B', 'C')),

    -- Run lifecycle
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Run statistics
    pages_fetched INTEGER DEFAULT 0,
    items_extracted INTEGER DEFAULT 0,
    items_promoted INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,

    -- Configuration snapshot (for reproducibility)
    config_snapshot JSONB NOT NULL DEFAULT '{}',

    -- Error tracking
    error_message TEXT,
    error_traceback TEXT,

    -- Metadata
    triggered_by VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_scrape_runs_scraper_started ON scrape_runs(scraper_name, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_scrape_runs_domain_started ON scrape_runs(source_domain, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_scrape_runs_status ON scrape_runs(status) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS ix_scrape_runs_run_id ON scrape_runs(run_id);

-- =============================================================================
-- LAYER 2: SCRAPED ENTITIES (Per-Source Extraction)
-- =============================================================================
CREATE TABLE IF NOT EXISTS scraped_entities (
    id SERIAL PRIMARY KEY,

    -- Entity identification
    entity_type VARCHAR(50) NOT NULL,
    entity_key VARCHAR(255) NOT NULL,

    -- Source provenance
    source_domain VARCHAR(255) NOT NULL,
    source_url TEXT NOT NULL,
    source_tier CHAR(1) NOT NULL CHECK (source_tier IN ('A', 'B', 'C')),

    -- Extracted data
    extracted JSONB NOT NULL,
    extracted_hash VARCHAR(64) NOT NULL,

    -- Scrape tracking
    run_id VARCHAR(36) NOT NULL REFERENCES scrape_runs(run_id) ON DELETE CASCADE,
    scraped_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Parse status
    parse_status VARCHAR(20) NOT NULL DEFAULT 'success'
        CHECK (parse_status IN ('success', 'partial', 'failed', 'schema_mismatch')),
    parse_errors JSONB,

    -- Schema versioning
    schema_version VARCHAR(20) NOT NULL DEFAULT 'v1',

    -- Unique constraint per source
    UNIQUE (entity_type, entity_key, source_domain)
);

CREATE INDEX IF NOT EXISTS ix_scraped_entities_type_key ON scraped_entities(entity_type, entity_key);
CREATE INDEX IF NOT EXISTS ix_scraped_entities_run ON scraped_entities(run_id);
CREATE INDEX IF NOT EXISTS ix_scraped_entities_domain_scraped ON scraped_entities(source_domain, scraped_at DESC);
CREATE INDEX IF NOT EXISTS ix_scraped_entities_hash ON scraped_entities(extracted_hash);

-- =============================================================================
-- LAYER 3: CANONICAL ENTITIES (Merged Truth)
-- =============================================================================
CREATE TABLE IF NOT EXISTS canonical_entities (
    id SERIAL PRIMARY KEY,

    -- Entity identification
    entity_type VARCHAR(50) NOT NULL,
    entity_key VARCHAR(255) NOT NULL,

    -- Canonical data
    canonical JSONB NOT NULL,
    canonical_hash VARCHAR(64) NOT NULL,

    -- Confidence and status
    confidence_score DECIMAL(5, 4) NOT NULL DEFAULT 1.0
        CHECK (confidence_score >= 0 AND confidence_score <= 1),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deprecated', 'needs_review', 'pending')),

    -- Provenance tracking
    provenance JSONB NOT NULL DEFAULT '[]',
    highest_tier CHAR(1) NOT NULL CHECK (highest_tier IN ('A', 'B', 'C')),

    -- Lifecycle
    first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_promoted_at TIMESTAMP,

    -- Unique constraint
    UNIQUE (entity_type, entity_key)
);

CREATE INDEX IF NOT EXISTS ix_canonical_entities_type_status ON canonical_entities(entity_type, status);
CREATE INDEX IF NOT EXISTS ix_canonical_entities_status ON canonical_entities(status) WHERE status = 'needs_review';
CREATE INDEX IF NOT EXISTS ix_canonical_entities_hash ON canonical_entities(canonical_hash);

-- =============================================================================
-- LAYER 4: ENTITY CANDIDATES (Pending Review)
-- =============================================================================
CREATE TABLE IF NOT EXISTS entity_candidates (
    id SERIAL PRIMARY KEY,

    -- Entity identification
    entity_type VARCHAR(50) NOT NULL,
    entity_key VARCHAR(255) NOT NULL,

    -- Candidate data
    candidate JSONB NOT NULL,
    candidate_hash VARCHAR(64) NOT NULL,

    -- Review metadata
    reason VARCHAR(50) NOT NULL
        CHECK (reason IN ('tier_c_only', 'conflict', 'schema_change', 'low_confidence', 'field_mismatch')),
    review_status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (review_status IN ('open', 'approved', 'rejected', 'merged')),

    -- Source information
    source_domain VARCHAR(255) NOT NULL,
    source_tier CHAR(1) NOT NULL CHECK (source_tier IN ('A', 'B', 'C')),
    scraped_entity_id INTEGER REFERENCES scraped_entities(id) ON DELETE SET NULL,

    -- Conflict details
    conflict_details JSONB,

    -- Review tracking
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP,
    review_notes TEXT,

    -- Lifecycle
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Unique constraint
    UNIQUE (entity_type, entity_key, source_domain, candidate_hash)
);

CREATE INDEX IF NOT EXISTS ix_candidates_review ON entity_candidates(review_status) WHERE review_status = 'open';
CREATE INDEX IF NOT EXISTS ix_candidates_type_status ON entity_candidates(entity_type, review_status);
CREATE INDEX IF NOT EXISTS ix_candidates_reason ON entity_candidates(reason);

-- =============================================================================
-- SCRAPER CACHE (Raw Response Caching)
-- =============================================================================
CREATE TABLE IF NOT EXISTS scraper_cache (
    id SERIAL PRIMARY KEY,

    -- Cache key
    cache_key VARCHAR(512) NOT NULL UNIQUE,
    url TEXT NOT NULL,

    -- Cached content
    raw_html TEXT,
    raw_html_hash VARCHAR(64) NOT NULL,
    response_headers JSONB,
    http_status INTEGER NOT NULL,

    -- Timing
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,

    -- Metadata
    scraper_name VARCHAR(100) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_scraper_cache_url ON scraper_cache(url);
CREATE INDEX IF NOT EXISTS ix_scraper_cache_expires ON scraper_cache(expires_at) WHERE expires_at IS NOT NULL;

-- =============================================================================
-- SCHEMA CHANGE DETECTION
-- =============================================================================
CREATE TABLE IF NOT EXISTS scraper_schema_changes (
    id SERIAL PRIMARY KEY,

    -- Entity reference
    entity_type VARCHAR(50) NOT NULL,
    entity_key VARCHAR(255) NOT NULL,
    source_domain VARCHAR(255) NOT NULL,

    -- Change detection
    previous_hash VARCHAR(64) NOT NULL,
    new_hash VARCHAR(64) NOT NULL,
    raw_html_hash_changed BOOLEAN NOT NULL DEFAULT FALSE,
    extracted_hash_changed BOOLEAN NOT NULL DEFAULT TRUE,

    -- Change details
    change_type VARCHAR(30) NOT NULL
        CHECK (change_type IN ('new_fields', 'removed_fields', 'value_change', 'type_change', 'structure_change')),
    change_details JSONB NOT NULL,

    -- Timing
    detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    run_id VARCHAR(36) REFERENCES scrape_runs(run_id) ON DELETE SET NULL,

    -- Review
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(100),
    resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS ix_schema_changes_unack ON scraper_schema_changes(acknowledged) WHERE acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS ix_schema_changes_type_detected ON scraper_schema_changes(entity_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS ix_schema_changes_domain ON scraper_schema_changes(source_domain, detected_at DESC);

-- =============================================================================
-- DISCOVERED LINKS (URL Discovery Mode)
-- =============================================================================
CREATE TABLE IF NOT EXISTS discovered_links (
    id SERIAL PRIMARY KEY,

    -- Link details
    url TEXT NOT NULL,
    url_hash VARCHAR(64) NOT NULL UNIQUE,
    source_domain VARCHAR(255) NOT NULL,

    -- Discovery metadata
    discovered_from_url TEXT,
    discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
    run_id VARCHAR(36) REFERENCES scrape_runs(run_id) ON DELETE SET NULL,

    -- Processing status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'skipped')),
    priority INTEGER DEFAULT 0,

    -- Classification hints
    estimated_entity_type VARCHAR(50),
    estimated_tier CHAR(1) CHECK (estimated_tier IN ('A', 'B', 'C')),

    -- Processing tracking
    processed_at TIMESTAMP,
    process_result VARCHAR(50),
    process_notes TEXT
);

CREATE INDEX IF NOT EXISTS ix_discovered_links_pending ON discovered_links(status, priority DESC)
    WHERE status IN ('pending', 'queued');
CREATE INDEX IF NOT EXISTS ix_discovered_links_domain_discovered ON discovered_links(source_domain, discovered_at DESC);

-- =============================================================================
-- FIELD AUTHORITY RULES (Seeded separately in 011_seed_field_authority.sql)
-- =============================================================================
CREATE TABLE IF NOT EXISTS field_authority_rules (
    id SERIAL PRIMARY KEY,

    -- Field identification
    entity_type VARCHAR(50) NOT NULL,
    field_name VARCHAR(100) NOT NULL,

    -- Authority rules
    min_tier_required CHAR(1) NOT NULL CHECK (min_tier_required IN ('A', 'B', 'C')),
    tier_a_authoritative BOOLEAN NOT NULL DEFAULT TRUE,
    tier_b_can_update BOOLEAN NOT NULL DEFAULT TRUE,
    tier_c_can_update BOOLEAN NOT NULL DEFAULT FALSE,

    -- Labeling
    requires_verification_label BOOLEAN NOT NULL DEFAULT FALSE,
    verification_label TEXT,

    -- Validation
    validation_type VARCHAR(30),

    -- Metadata
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE (entity_type, field_name)
);

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE scrape_runs IS 'Tracks individual scraper run executions';
COMMENT ON TABLE scraped_entities IS 'Raw extracted data from each source, one row per entity per source';
COMMENT ON TABLE canonical_entities IS 'Merged truth from multiple sources, the apps source of truth';
COMMENT ON TABLE entity_candidates IS 'Entities pending manual review before promotion';
COMMENT ON TABLE scraper_cache IS 'Cached HTTP responses to avoid redundant fetches';
COMMENT ON TABLE scraper_schema_changes IS 'Detected changes in source page structures';
COMMENT ON TABLE discovered_links IS 'URLs discovered during DISCOVERY mode for future processing';
COMMENT ON TABLE field_authority_rules IS 'Rules for which tiers can update which fields';
