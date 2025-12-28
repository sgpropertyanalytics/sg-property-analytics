"""
Global middleware for API requests.

Provides:
- Request ID injection (X-Request-ID)
- Error envelope standardization
- Query timing instrumentation (X-DB-Time-Ms, X-Query-Count)
"""

from .request_id import setup_request_id_middleware
from .error_envelope import setup_error_handlers
from .query_timing import setup_query_timing_middleware

__all__ = [
    'setup_request_id_middleware',
    'setup_error_handlers',
    'setup_query_timing_middleware',
]
