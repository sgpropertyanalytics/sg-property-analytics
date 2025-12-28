"""
Query timing middleware - Lightweight SQL timing for observability.

Captures:
- Query execution time (db_time_ms)
- Query count per request
- Correlates with request_id

Safe for production - no EXPLAIN ANALYZE, just timing.

Log format:
    SLOW_QUERY request_id=<uuid> elapsed_ms=<float> stmt=<first 80 chars>
    REQUEST_TIMING request_id=<uuid> db_time_ms=<float> query_count=<int>
"""

import logging
import time
from threading import local
from typing import Optional

from flask import Flask, g
from sqlalchemy import event
from sqlalchemy.engine import Engine

logger = logging.getLogger('query_timing')

# Thread-local storage for query timing (safe for concurrent requests)
_timing = local()

# Configuration
SLOW_QUERY_THRESHOLD_MS = 500  # Log queries slower than this


def setup_query_timing_middleware(app: Flask) -> None:
    """
    Set up query timing middleware on Flask app.

    Hooks into SQLAlchemy engine events to time all queries.
    Injects timing headers into responses.

    Args:
        app: Flask application instance
    """

    @event.listens_for(Engine, "before_cursor_execute")
    def before_execute(conn, cursor, statement, parameters, context, executemany):
        """Record query start time."""
        context._query_start_time = time.perf_counter()

    @event.listens_for(Engine, "after_cursor_execute")
    def after_execute(conn, cursor, statement, parameters, context, executemany):
        """Record query elapsed time and accumulate per-request."""
        start_time = getattr(context, '_query_start_time', None)
        if start_time is None:
            return

        elapsed_ms = (time.perf_counter() - start_time) * 1000

        # Accumulate timing in thread-local storage
        if not hasattr(_timing, 'queries'):
            _timing.queries = []

        _timing.queries.append({
            'elapsed_ms': round(elapsed_ms, 2),
            'rows_affected': cursor.rowcount if cursor.rowcount >= 0 else None,
        })

        # Log slow queries (>500ms)
        if elapsed_ms > SLOW_QUERY_THRESHOLD_MS:
            request_id = _get_request_id()
            # Truncate statement for logging (first 80 chars)
            stmt_preview = (statement[:80] + '...') if statement and len(statement) > 80 else statement
            logger.warning(
                f"SLOW_QUERY request_id={request_id} "
                f"elapsed_ms={elapsed_ms:.2f} stmt={stmt_preview}"
            )

    @app.before_request
    def reset_query_timing():
        """Reset query timing at start of each request."""
        _timing.queries = []

    @app.after_request
    def inject_timing_headers(response):
        """Add timing headers to response for observability."""
        queries = getattr(_timing, 'queries', [])
        if not queries:
            return response

        total_db_ms = sum(q['elapsed_ms'] for q in queries)
        query_count = len(queries)

        # Add headers for observability (visible in browser dev tools, curl)
        response.headers['X-DB-Time-Ms'] = str(round(total_db_ms, 2))
        response.headers['X-Query-Count'] = str(query_count)

        # Log significant DB time for monitoring
        if total_db_ms > 200:
            request_id = _get_request_id()
            logger.info(
                f"REQUEST_TIMING request_id={request_id} "
                f"db_time_ms={total_db_ms:.2f} query_count={query_count}"
            )

        return response


def _get_request_id() -> str:
    """Get current request ID from Flask context, or 'no-request-id' if unavailable."""
    return getattr(g, 'request_id', 'no-request-id')


def get_request_timing() -> dict:
    """
    Get timing data for current request.

    Returns:
        dict with total_db_ms, query_count, and individual query timings
    """
    queries = getattr(_timing, 'queries', [])
    return {
        'total_db_ms': sum(q['elapsed_ms'] for q in queries),
        'query_count': len(queries),
        'queries': queries,
    }
