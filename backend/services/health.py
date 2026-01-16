"""
Health and Readiness Check Service

Provides fast, fail-safe health checks for orchestration platforms.

Functions:
- check_database_ready(): DB readiness with strict timeout + TTL caching
"""

from typing import Optional, Tuple
from sqlalchemy import text
from models.database import db
import logging
import time

logger = logging.getLogger(__name__)

# Cache for readiness check (avoids repeated 30s hangs on unreachable DB)
# Format: (result: bool, timestamp: float)
_readiness_cache: Optional[Tuple[bool, float]] = None
_CACHE_TTL_SECONDS = 10  # Cache result for 10 seconds


def check_database_ready(timeout_ms: int = 500, use_cache: bool = True) -> bool:
    """
    Check if database is ready to accept queries.

    Uses engine-level connection (not session) with transaction-scoped
    statement_timeout and TTL caching to prevent repeated 30s hangs.

    Args:
        timeout_ms: Maximum time to wait in milliseconds (default 500ms)
        use_cache: Use TTL cache to avoid hammering DB (default True)

    Returns:
        True if database responds within timeout, False otherwise

    Example:
        if check_database_ready(timeout_ms=500):
            return jsonify({"status": "ready"}), 200
        else:
            return jsonify({"status": "not_ready"}), 503

    Caching behavior:
        - First call attempts real DB check
        - Result cached for 10 seconds
        - Subsequent calls within TTL return cached result
        - Prevents one bad connect attempt from stalling multiple workers

    Note:
        - Uses engine.begin() to ensure SET LOCAL applies in transaction
        - Avoids db.session to prevent polluting request-scoped sessions
        - statement_timeout bounds query execution, not TCP connect
        - If DB is unreachable, first connect can still block ~30s
          (subsequent calls use cache)
    """
    global _readiness_cache

    # Check cache first
    if use_cache and _readiness_cache is not None:
        cached_result, cached_time = _readiness_cache
        age = time.time() - cached_time
        if age < _CACHE_TTL_SECONDS:
            logger.debug(f"Using cached readiness result: {cached_result} (age: {age:.1f}s)")
            return cached_result

    # Attempt real DB check
    try:
        # Use engine-level connection to avoid session pollution
        # begin() creates transaction context for SET LOCAL
        with db.engine.begin() as conn:
            # SET LOCAL applies within this transaction only
            conn.execute(text(f"SET LOCAL statement_timeout = '{timeout_ms}ms'"))
            conn.execute(text("SELECT 1"))

        result = True
        logger.debug(f"Database readiness check succeeded (timeout={timeout_ms}ms)")
    except Exception as e:
        result = False
        logger.debug(f"Database readiness check failed: {e}")

    # Update cache
    if use_cache:
        _readiness_cache = (result, time.time())

    return result
