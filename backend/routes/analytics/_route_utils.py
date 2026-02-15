"""
Shared route utilities for analytics endpoints.

Goals:
- Replace ad-hoc print timing/error logs with structured logger usage
- Keep endpoint handlers small and consistent
"""

import time
import logging
from typing import Any, Dict, Optional


def route_logger(name: str) -> logging.Logger:
    """Return namespaced logger for analytics routes."""
    return logging.getLogger(f"analytics.{name}")


def elapsed_ms(start_time: float) -> int:
    """
    Return elapsed milliseconds.

    Supports either perf_counter() or time.time() style start values.
    """
    now = time.perf_counter() if start_time < 1_000_000 else time.time()
    return int((now - start_time) * 1000)


def log_success(
    logger: logging.Logger,
    route: str,
    start_time: float,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    payload = {"route": route, "elapsed_ms": elapsed_ms(start_time)}
    if details:
        payload.update(details)
    logger.info("route_success %s", payload)


def log_error(
    logger: logging.Logger,
    route: str,
    start_time: float,
    err: Exception,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    payload = {"route": route, "elapsed_ms": elapsed_ms(start_time)}
    if details:
        payload.update(details)
    logger.exception("route_error %s err=%s", payload, err)
