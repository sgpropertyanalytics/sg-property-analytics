"""
Processed Webhook Model - For Stripe webhook idempotency

Stores processed Stripe event IDs to prevent duplicate processing.
Events are stored with TTL for cleanup.
"""
from models.database import db
from datetime import datetime, timedelta


class ProcessedWebhook(db.Model):
    __tablename__ = 'processed_webhooks'

    # Stripe event ID (e.g., "evt_1234567890")
    event_id = db.Column(db.String(255), primary_key=True)

    # Event type for debugging
    event_type = db.Column(db.String(100))

    # Timestamp for TTL cleanup
    processed_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    @classmethod
    def is_processed(cls, event_id):
        """Check if event has already been processed."""
        return db.session.query(cls).filter_by(event_id=event_id).first() is not None

    @classmethod
    def mark_processed(cls, event_id, event_type=None):
        """Mark event as processed."""
        if not cls.is_processed(event_id):
            record = cls(event_id=event_id, event_type=event_type)
            db.session.add(record)
            db.session.commit()

    @classmethod
    def cleanup_old_events(cls, days=30):
        """
        Remove events older than specified days.

        Call periodically (e.g., daily cron) to prevent table bloat.
        """
        cutoff = datetime.utcnow() - timedelta(days=days)
        deleted = db.session.query(cls).filter(cls.processed_at < cutoff).delete()
        db.session.commit()
        return deleted
