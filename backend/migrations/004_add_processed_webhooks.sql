-- Migration: Add processed_webhooks table for Stripe webhook idempotency
-- This table stores Stripe event IDs to prevent duplicate processing

CREATE TABLE IF NOT EXISTS processed_webhooks (
    event_id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for cleanup queries (TTL-based deletion of old events)
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_processed_at
ON processed_webhooks(processed_at);

-- Comment for documentation
COMMENT ON TABLE processed_webhooks IS 'Stripe webhook idempotency - stores processed event IDs';
