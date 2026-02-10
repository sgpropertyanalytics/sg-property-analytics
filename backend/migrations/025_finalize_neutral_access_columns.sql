-- Migration 025: Finalize neutral access naming (phase 2 - breaking)
--
-- Run ONLY after:
-- 1) app reads/writes neutral columns exclusively
-- 2) no consumers depend on legacy column names
-- 3) row-level parity checks pass

BEGIN;

-- Safety check: legacy and neutral columns must be in parity.
DO $$
DECLARE
    mismatch_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO mismatch_count
    FROM users
    WHERE COALESCE(tier, 'free') IS DISTINCT FROM COALESCE(access_tier, 'free')
       OR COALESCE(subscription_status, '') IS DISTINCT FROM COALESCE(access_status, '')
       OR COALESCE(subscription_ends_at, TIMESTAMPTZ 'epoch') IS DISTINCT FROM COALESCE(access_expires_at, TIMESTAMPTZ 'epoch')
       OR COALESCE(stripe_customer_id, '') IS DISTINCT FROM COALESCE(billing_customer_ref, '')
       OR COALESCE(access_override, FALSE) IS DISTINCT FROM COALESCE(access_override_enabled, FALSE)
       OR COALESCE(override_until, TIMESTAMPTZ 'epoch') IS DISTINCT FROM COALESCE(access_override_until, TIMESTAMPTZ 'epoch')
       OR COALESCE(entitlement_source, '') IS DISTINCT FROM COALESCE(access_source, '');

    IF mismatch_count > 0 THEN
        RAISE EXCEPTION 'Cannot finalize neutral access naming: % mismatched rows remain.', mismatch_count;
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_sync_users_access_columns ON users;
DROP FUNCTION IF EXISTS sync_users_access_columns();

-- Remove legacy columns after full cutover.
ALTER TABLE users DROP COLUMN IF EXISTS tier;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_ends_at;
ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE users DROP COLUMN IF EXISTS access_override;
ALTER TABLE users DROP COLUMN IF EXISTS override_until;
ALTER TABLE users DROP COLUMN IF EXISTS entitlement_source;

-- Optional hardening of neutral schema.
ALTER TABLE users ALTER COLUMN access_tier SET DEFAULT 'free';
ALTER TABLE users ALTER COLUMN access_override_enabled SET DEFAULT FALSE;

COMMIT;
