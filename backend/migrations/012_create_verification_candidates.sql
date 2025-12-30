-- Migration 012: Create verification_candidates table
-- Phase 3: Verification Mode - stores cross-validation results from Tier B sources
--
-- Purpose: Records the comparison between current values (CSV/database) and
-- verified values from Tier B sources (PropertyGuru, EdgeProp, 99.co, ERA, PropNex)
-- for manual review before any corrections are applied.
--
-- Key design: 3-source minimum required for auto-confirmation.
-- < 3 agreeing sources → goes to review queue.

-- Create verification_candidates table
CREATE TABLE IF NOT EXISTS verification_candidates (
    id SERIAL PRIMARY KEY,

    -- Entity identification (what we're verifying)
    entity_type VARCHAR(50) NOT NULL,  -- 'unit_count', 'upcoming_launch', 'gls_tender', 'project_location'
    entity_key VARCHAR(255) NOT NULL,  -- project_name or release_id

    -- Current value in our system
    current_value JSONB NOT NULL,      -- {total_units: 1040, source: 'csv', ...}
    current_source VARCHAR(50),         -- 'csv', 'database', 'computed'

    -- Verified value from Tier B sources
    verified_value JSONB NOT NULL,     -- {total_units: 1040, sources: [...]}
    verified_sources JSONB NOT NULL,   -- [{source: 'propertyguru.com.sg', value: 1040, url: '...', scraped_at: '...'}]

    -- Source agreement tracking (for 3-source minimum rule)
    agreeing_source_count INTEGER NOT NULL DEFAULT 0,
    total_source_count INTEGER NOT NULL DEFAULT 0,

    -- Comparison result
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'confirmed', 'mismatch', 'unverified', 'conflict')),
    confidence_score DECIMAL(5,4),     -- 0.0000 to 1.0000

    -- Field-level mismatches
    field_mismatches JSONB,            -- [{field: 'total_units', current: 1040, verified: 1050, delta_pct: 0.0096, tolerance: 0.0}]

    -- Review workflow
    review_status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (review_status IN ('open', 'approved', 'rejected', 'auto_confirmed', 'deferred')),
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    resolution VARCHAR(30),            -- 'keep_current', 'update_to_verified', 'needs_investigation', 'source_error'

    -- Run tracking
    run_id VARCHAR(36) NOT NULL,
    verified_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Lifecycle
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Prevent duplicate verification for same entity in same run
    CONSTRAINT uq_verification_entity_run UNIQUE (entity_type, entity_key, run_id)
);

-- Indexes for common query patterns

-- Filter by verification status (find pending, mismatches, etc.)
CREATE INDEX IF NOT EXISTS ix_verification_candidates_status
    ON verification_candidates(verification_status);

-- Filter by review status (find open items for review queue)
CREATE INDEX IF NOT EXISTS ix_verification_candidates_review
    ON verification_candidates(review_status)
    WHERE review_status = 'open';

-- Filter by entity type and status (e.g., all pending unit_count verifications)
CREATE INDEX IF NOT EXISTS ix_verification_candidates_type_status
    ON verification_candidates(entity_type, verification_status);

-- Filter by run (get all results from a verification run)
CREATE INDEX IF NOT EXISTS ix_verification_candidates_run
    ON verification_candidates(run_id);

-- Lookup specific entity across runs
CREATE INDEX IF NOT EXISTS ix_verification_candidates_entity
    ON verification_candidates(entity_type, entity_key);

-- Find low-confidence results that need review
CREATE INDEX IF NOT EXISTS ix_verification_candidates_confidence
    ON verification_candidates(confidence_score)
    WHERE confidence_score < 0.9;

-- Find results with insufficient sources (< 3)
CREATE INDEX IF NOT EXISTS ix_verification_candidates_source_count
    ON verification_candidates(agreeing_source_count)
    WHERE agreeing_source_count < 3;

-- Time-based queries (recent verifications)
CREATE INDEX IF NOT EXISTS ix_verification_candidates_verified_at
    ON verification_candidates(verified_at DESC);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_verification_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verification_candidates_updated_at ON verification_candidates;
CREATE TRIGGER trg_verification_candidates_updated_at
    BEFORE UPDATE ON verification_candidates
    FOR EACH ROW
    EXECUTE FUNCTION update_verification_candidates_updated_at();

-- Add comment explaining the table purpose
COMMENT ON TABLE verification_candidates IS 'Stores cross-validation results from Tier B sources for manual review. 3+ agreeing sources required for auto-confirmation.';
COMMENT ON COLUMN verification_candidates.agreeing_source_count IS 'Number of Tier B sources that agree on the verified value. Must be >= 3 for auto-confirmation.';
COMMENT ON COLUMN verification_candidates.verification_status IS 'pending=awaiting review, confirmed=matches current, mismatch=differs from current, unverified=insufficient sources, conflict=sources disagree';
COMMENT ON COLUMN verification_candidates.review_status IS 'open=needs review, approved=accepted, rejected=dismissed, auto_confirmed=3+ sources agreed and matched, deferred=postponed';
