"""
Request logging middleware - lightweight usage sampling.

Logs API requests for deprecation monitoring with sampling and watchlists.
"""

import logging
import os
import random
import time
from typing import List

from flask import Flask, g, request


logger = logging.getLogger("api.request")


def _parse_watchlist(raw: str) -> List[str]:
    if not raw:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


def _should_log(path: str, watchlist: List[str], sample_rate: float) -> bool:
    if watchlist:
        return any(path.startswith(prefix) for prefix in watchlist)
    if sample_rate <= 0:
        return False
    if sample_rate >= 1:
        return True
    return random.random() <= sample_rate


def setup_request_logging_middleware(app: Flask) -> None:
    """
    Set up request logging middleware on Flask app.

    Env vars:
      - REQUEST_LOG_ENABLED (default: true)
      - REQUEST_LOG_SAMPLE_RATE (default: 0.0)
      - REQUEST_LOG_ENDPOINTS (comma-separated path prefixes to always log)
    """
    enabled = os.environ.get("REQUEST_LOG_ENABLED", "true").lower() == "true"
    sample_rate_raw = os.environ.get("REQUEST_LOG_SAMPLE_RATE", "0.0")
    try:
        sample_rate = float(sample_rate_raw)
    except ValueError:
        sample_rate = 0.0
    watchlist = _parse_watchlist(os.environ.get("REQUEST_LOG_ENDPOINTS", ""))

    if not enabled:
        return

    @app.before_request
    def _start_timer():
        g.request_start = time.perf_counter()

    @app.after_request
    def _log_request(response):
        path = request.path
        if not path.startswith("/api"):
            return response

        if not _should_log(path, watchlist, sample_rate):
            return response

        duration_ms = None
        if hasattr(g, "request_start"):
            duration_ms = round((time.perf_counter() - g.request_start) * 1000, 2)

        logger.info(
            "api_request path=%s method=%s status=%s duration_ms=%s request_id=%s",
            path,
            request.method,
            response.status_code,
            duration_ms,
            getattr(g, "request_id", None),
        )
        return response
