"""
Rate Limiter Configuration for URA Compliance

Provides rate limiting to prevent bulk data extraction attempts.
Uses Redis in production, memory storage for development.

Key decisions:
- User-based key when logged in (prevents punishing shared IPs)
- IP-based key for anonymous requests
- Tiered limits by endpoint cost
"""

import os
import logging
from flask import request, g

logger = logging.getLogger(__name__)

# Storage configuration: Redis in production, memory for dev
REDIS_URL = os.environ.get("REDIS_URL")

if REDIS_URL:
    storage_uri = REDIS_URL
    logger.info("Rate limiter using Redis storage")
else:
    storage_uri = "memory://"
    logger.warning("Rate limiter using in-memory storage (dev only)")


def get_rate_limit_key():
    """
    Get rate limit key - user_id if logged in, else remote_addr.

    Using user_id when available avoids punishing users on shared IPs
    (e.g., corporate networks, coffee shops).
    """
    if hasattr(g, 'current_user') and g.current_user:
        return f"user:{g.current_user.id}"
    return f"ip:{request.remote_addr}"


# Per-endpoint rate limits (tune by computational cost)
# Format: "X per period" where period is minute, hour, day
RATE_LIMITS = {
    # Cached/lightweight endpoints - generous limits
    "cached": "200 per minute",

    # Moderate compute - aggregate summary, filter options
    "summary": "60 per minute",

    # Heavy compute - complex aggregations, project summaries
    "heavy": "20 per minute",

    # Deprecated endpoints - strict to discourage use
    "deprecated": "5 per minute",
}

# Default limits for unannotated endpoints
DEFAULT_LIMITS = ["1000 per day", "300 per hour"]


def init_limiter(app):
    """
    Initialize Flask-Limiter with the app.

    Call this in app.py after creating the Flask app:
        from utils.rate_limiter import init_limiter
        limiter = init_limiter(app)

    Returns the limiter instance for decorator use.
    """
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address

    limiter = Limiter(
        app=app,
        key_func=get_rate_limit_key,
        default_limits=DEFAULT_LIMITS,
        storage_uri=storage_uri,
        # Include route in key to allow per-endpoint limits
        key_prefix="rate_limit",
        # Return 429 with retry-after header
        headers_enabled=True,
    )

    # Custom error handler for rate limit exceeded
    @app.errorhandler(429)
    def ratelimit_handler(e):
        return {
            "error": "Rate limit exceeded",
            "message": str(e.description),
            "retry_after": e.retry_after if hasattr(e, 'retry_after') else 60,
        }, 429

    logger.info(f"Rate limiter initialized with storage: {storage_uri}")
    return limiter


def get_limiter():
    """
    Get the rate limiter instance.

    Must be called after init_limiter() has been called.
    This is a convenience function for routes that need to apply
    custom limits using the @limiter.limit() decorator.
    """
    from flask import current_app
    return current_app.extensions.get("limiter")
