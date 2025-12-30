-- Migration 013: Add verification status columns to domain tables
-- Phase 3: Verification Mode - tracks cross-validation results on domain records
--
-- Adds verification tracking to:
-- - upcoming_launches (units, pricing)
-- - gls_tenders (location, supply, pricing)
-- - project_locations (coordinates, address)

-- =============================================================================
-- UPCOMING_LAUNCHES - Unit count and pricing verification
-- =============================================================================

-- Verification status for the record overall
ALTER TABLE upcoming_launches ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20);
-- Values: 'unverified', 'verified', 'partial', 'disputed', 'conflict'

-- When was this record last verified?
ALTER TABLE upcoming_launches ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

-- Which verification run confirmed this?
ALTER TABLE upcoming_launches ADD COLUMN IF NOT EXISTS verified_run_id VARCHAR(36);

-- Which sources were used to verify? (JSONB array)
-- Example: [{"source": "propertyguru.com.sg", "value": 1040, "verified_at": "2025-01-15"}]
ALTER TABLE upcoming_launches ADD COLUMN IF NOT EXISTS verified_sources JSONB;

-- Confidence score from verification (0.0 to 1.0)
ALTER TABLE upcoming_launches ADD COLUMN IF NOT EXISTS units_confidence_score DECIMAL(5,4);

-- How many sources agreed on the verified value?
ALTER TABLE upcoming_launches ADD COLUMN IF NOT EXISTS agreeing_source_count INTEGER;


-- =============================================================================
-- GLS_TENDERS - Location and supply verification
-- =============================================================================

-- Verification status for the tender
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20);
-- Values: 'unverified', 'verified', 'partial', 'disputed'

-- When was this tender last verified?
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

-- Which verification run confirmed this?
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS verified_run_id VARCHAR(36);

-- Which sources were used to verify?
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS verified_sources JSONB;

-- Field-specific verification flags
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS location_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS supply_estimate_verified BOOLEAN DEFAULT FALSE;

-- How many sources agreed?
ALTER TABLE gls_tenders ADD COLUMN IF NOT EXISTS agreeing_source_count INTEGER;


-- =============================================================================
-- PROJECT_LOCATIONS - Coordinate and address verification
-- =============================================================================

-- Verification status for the location
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20);
-- Values: 'unverified', 'verified', 'disputed'

-- When was this location last verified?
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

-- Which verification run confirmed this?
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS verified_run_id VARCHAR(36);

-- Which sources were used to verify?
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS verified_sources JSONB;

-- Geocoding confidence from verification (0.0 to 1.0)
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS geocode_confidence DECIMAL(5,4);

-- Was the address manually verified?
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS coordinates_verified BOOLEAN DEFAULT FALSE;

-- If manually overridden, why?
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS manual_override_reason TEXT;


-- =============================================================================
-- INDEXES for verification queries
-- =============================================================================

-- Find unverified records in upcoming_launches
CREATE INDEX IF NOT EXISTS ix_upcoming_launches_verification_status
    ON upcoming_launches(verification_status)
    WHERE verification_status IS NOT NULL;

-- Find records needing review (low confidence or insufficient sources)
CREATE INDEX IF NOT EXISTS ix_upcoming_launches_confidence
    ON upcoming_launches(units_confidence_score)
    WHERE units_confidence_score IS NOT NULL AND units_confidence_score < 0.9;

-- Find records by verification run
CREATE INDEX IF NOT EXISTS ix_upcoming_launches_verified_run
    ON upcoming_launches(verified_run_id)
    WHERE verified_run_id IS NOT NULL;

-- GLS tenders verification indexes
CREATE INDEX IF NOT EXISTS ix_gls_tenders_verification_status
    ON gls_tenders(verification_status)
    WHERE verification_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_gls_tenders_verified_run
    ON gls_tenders(verified_run_id)
    WHERE verified_run_id IS NOT NULL;

-- Project locations verification indexes
CREATE INDEX IF NOT EXISTS ix_project_locations_verification_status
    ON project_locations(verification_status)
    WHERE verification_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_project_locations_verified_run
    ON project_locations(verified_run_id)
    WHERE verified_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_project_locations_coordinates_verified
    ON project_locations(coordinates_verified)
    WHERE coordinates_verified = TRUE;


-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN upcoming_launches.verification_status IS 'Cross-validation status: unverified, verified (3+ sources agree), partial, disputed, conflict';
COMMENT ON COLUMN upcoming_launches.units_confidence_score IS '0.0-1.0 confidence based on source agreement. 0.9+ = 3+ sources agree';
COMMENT ON COLUMN upcoming_launches.agreeing_source_count IS 'Number of Tier B sources agreeing on verified value. Minimum 3 for auto-confirm.';

COMMENT ON COLUMN gls_tenders.verification_status IS 'Cross-validation status: unverified, verified, partial, disputed';
COMMENT ON COLUMN gls_tenders.location_verified IS 'TRUE if location/coordinates verified against Tier A/B sources';
COMMENT ON COLUMN gls_tenders.supply_estimate_verified IS 'TRUE if estimated_units verified against Tier A/B sources';

COMMENT ON COLUMN project_locations.verification_status IS 'Cross-validation status: unverified, verified, disputed';
COMMENT ON COLUMN project_locations.geocode_confidence IS '0.0-1.0 confidence in geocoded coordinates';
COMMENT ON COLUMN project_locations.coordinates_verified IS 'TRUE if lat/lng manually verified against map';
