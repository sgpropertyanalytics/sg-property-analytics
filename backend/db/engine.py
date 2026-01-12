"""
Canonical database engine factory for all non-Flask contexts.

This is the SINGLE SOURCE OF TRUTH for database engine creation outside Flask.
Flask uses db.init_app(app) with Config.SQLALCHEMY_ENGINE_OPTIONS.
Everything else (cron jobs, scripts, background tasks) uses this factory.

Usage:
    from db.engine import get_engine

    # For cron/one-shot scripts (uses NullPool - no connection pooling)
    engine = get_engine("job")

    # For long-lived non-Flask processes (uses QueuePool)
    engine = get_engine("web")

Why NullPool for jobs?
    - Cron processes are short-lived
    - Pooling doesn't help and increases stale connection risk
    - Cleaner with PgBouncer transaction mode (Supabase)
    - Each DB operation is a clean connect/close cycle

Warmup with retry:
    - Handles Supabase cold starts
    - Exponential backoff (0.75s, 1.5s, 3s, 6s)
    - Fails fast after 4 attempts with clear error

CI Enforcement:
    - scripts/guard_no_create_engine.py ensures no direct create_engine() usage
    - Only this file is allowed to call create_engine()
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.pool import NullPool

log = logging.getLogger(__name__)

# Module-level engine cache (per-process singletons)
_ENGINE_JOB: Optional[Engine] = None
_ENGINE_WEB: Optional[Engine] = None


def _base_options() -> Dict[str, Any]:
    """
    Get base engine options from Config.SQLALCHEMY_ENGINE_OPTIONS.

    This ensures all engine creation uses the same timeout/pool settings
    defined in config.py (single source of truth).
    """
    from config import Config

    opts = dict(getattr(Config, "SQLALCHEMY_ENGINE_OPTIONS", {}) or {})
    return opts


def _warmup(engine: Engine, attempts: int = 4, base_sleep: float = 0.75) -> None:
    """
    Warm up database connection with exponential backoff retry.

    This handles:
    - Supabase cold starts (pooler may be slow to respond)
    - Transient network issues on Render
    - PgBouncer connection delays

    Args:
        engine: SQLAlchemy engine to warm up
        attempts: Number of retry attempts (default 4)
        base_sleep: Base sleep time in seconds (doubles each attempt)

    Raises:
        OperationalError: If all attempts fail
    """
    last_error: Optional[Exception] = None

    for i in range(attempts):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            log.info("db_warmup_success attempt=%d", i + 1)
            return
        except OperationalError as e:
            last_error = e
            sleep_s = base_sleep * (2 ** i)
            log.warning(
                "db_warmup_retry attempt=%d/%d sleep_s=%.2f err=%s",
                i + 1, attempts, sleep_s, str(e)[:100]
            )
            time.sleep(sleep_s)

    # All attempts failed
    log.error("db_warmup_failed after %d attempts", attempts)
    raise last_error  # type: ignore[misc]


def get_engine(kind: str = "job") -> Engine:
    """
    Get a database engine configured for the specified use case.

    Args:
        kind: Engine type
            - "job": For cron/one-shot scripts. Uses NullPool to avoid
                     connection pooling issues with short-lived processes.
            - "web": For long-lived non-Flask processes. Uses configured
                     QueuePool settings from Config.

    Returns:
        SQLAlchemy Engine instance (cached per-process)

    Raises:
        ValueError: If kind is not "job" or "web"
        OperationalError: If database connection fails after retries

    Example:
        from db.engine import get_engine
        from sqlalchemy.orm import scoped_session, sessionmaker

        engine = get_engine("job")
        Session = scoped_session(sessionmaker(bind=engine))
        session = Session()

        try:
            result = session.execute(text("SELECT COUNT(*) FROM transactions"))
            print(result.scalar())
        finally:
            session.close()
            Session.remove()
            engine.dispose()
    """
    global _ENGINE_JOB, _ENGINE_WEB

    if kind not in ("job", "web"):
        raise ValueError("kind must be 'job' or 'web'")

    # Return cached engine if available
    if kind == "job" and _ENGINE_JOB is not None:
        return _ENGINE_JOB
    if kind == "web" and _ENGINE_WEB is not None:
        return _ENGINE_WEB

    # Get database URL from config (handles postgres:// fix, SSL, etc.)
    from config import get_database_url
    database_url = get_database_url()

    # Get base options from Config.SQLALCHEMY_ENGINE_OPTIONS
    opts = _base_options()

    # Extract connect_args (we handle these specially)
    connect_args = dict(opts.pop("connect_args", {}) or {})

    # Ensure critical timeouts are set (defense in depth)
    connect_args.setdefault("connect_timeout", 30)
    # statement_timeout is already in config via 'options' key

    if kind == "job":
        # Job mode: NullPool for short-lived processes
        # - No connection pooling (each query = fresh connection)
        # - Plays nicely with PgBouncer transaction mode
        # - Avoids stale connection issues in cron jobs
        engine = create_engine(
            database_url,
            poolclass=NullPool,
            connect_args=connect_args,
            # These are harmless with NullPool but keep them for consistency
            pool_pre_ping=opts.get("pool_pre_ping", True),
        )
        log.info("db_engine_created kind=job poolclass=NullPool")

        # Warm up connection (retry on failure)
        _warmup(engine)

        _ENGINE_JOB = engine
        return engine

    # Web mode: Use configured QueuePool settings
    engine = create_engine(
        database_url,
        connect_args=connect_args,
        **opts,
    )
    log.info(
        "db_engine_created kind=web pool_size=%s max_overflow=%s",
        opts.get("pool_size", "default"),
        opts.get("max_overflow", "default")
    )

    # Warm up connection (retry on failure)
    _warmup(engine)

    _ENGINE_WEB = engine
    return engine


def dispose_engines() -> None:
    """
    Dispose all cached engines (for testing/cleanup).

    Call this when you need to reset database connections,
    e.g., in test teardown or when handling connection errors.
    """
    global _ENGINE_JOB, _ENGINE_WEB

    if _ENGINE_JOB is not None:
        try:
            _ENGINE_JOB.dispose()
        except Exception:
            pass
        _ENGINE_JOB = None

    if _ENGINE_WEB is not None:
        try:
            _ENGINE_WEB.dispose()
        except Exception:
            pass
        _ENGINE_WEB = None

    log.info("db_engines_disposed")
